"""Persistent Python kernel. Runs only inside the resource-limited worker container."""
import ast
import contextlib
import io
import json
import os
import sys
import traceback
from pathlib import Path

protocol = sys.stdout
namespace = {"__name__": "__openclaude__"}
output_root = Path(sys.argv[1]).resolve()
output_root.mkdir(parents=True, exist_ok=True)
os.chdir(output_root)
os.environ["MPLBACKEND"] = "Agg"

class BoundedText(io.StringIO):
    def write(self, value):
        remaining = max(0, 100000 - self.tell())
        super().write(value[:remaining])
        return len(value)

def files():
    result = {}
    for path in output_root.rglob("*"):
        if len(result) >= 200:
            break
        if path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(output_root):
            info = path.stat()
            if info.st_size <= 20_000_000:
                result[str(path)] = (info.st_mtime_ns, info.st_size)
    return result

for request in sys.stdin:
    stdout, stderr = BoundedText(), BoundedText()
    result, error = None, None
    data, before = {}, {}
    try:
        data = json.loads(request)
        before = files()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            tree = ast.parse(data["code"], mode="exec")
            last = tree.body.pop() if tree.body and isinstance(tree.body[-1], ast.Expr) else None
            exec(compile(tree, "<Horizon Python>", "exec"), namespace)
            if last is not None:
                value = eval(compile(ast.Expression(last.value), "<Horizon Python>", "eval"), namespace)
                if value is not None:
                    result = repr(value)[:20000]
            if "matplotlib.pyplot" in sys.modules:
                plt = sys.modules["matplotlib.pyplot"]
                for number in plt.get_fignums()[:20]:
                    plt.figure(number).savefig(output_root / ("plot-" + data["id"] + "-" + str(number) + ".png"))
                plt.close("all")
    except BaseException:
        error = traceback.format_exc(limit=10)[-12000:]
    after = files()
    changed = [str(Path(path).relative_to("/workspace")) for path, stamp in after.items() if before.get(path) != stamp] if "before" in locals() else []
    protocol.write(json.dumps({"id": data.get("id"), "status": "failed" if error else "completed", "stdout": stdout.getvalue(), "stderr": stderr.getvalue(), "result": result, "error": error, "files": changed[:50]}, ensure_ascii=True) + "\n")
    protocol.flush()
