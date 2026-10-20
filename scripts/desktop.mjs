import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { mkdirSync, copyFileSync, existsSync, statSync } from 'node:fs';

if (process.platform === 'win32') {
  const folder = join(process.cwd(), '.local', 'desktop-runtime');
  mkdirSync(folder, { recursive: true });
  const target = join(folder, 'node.exe');
  if (!existsSync(target) || statSync(target).size !== statSync(process.execPath).size || statSync(target).mtimeMs < statSync(process.execPath).mtimeMs) {
    copyFileSync(process.execPath, target);
  }
}

const action = process.argv[2] ?? 'dev';
const root = process.cwd();
const target = join(process.env.LOCALAPPDATA ?? root, 'ClaudeLocalBuild', 'tauri-target');
mkdirSync(target, { recursive: true });
const env = { ...process.env, CARGO_TARGET_DIR: target, OPENCLAUDE_WORKSPACE_ROOT: root };

let vite;
const stopVite = () => {
  if (vite && vite.exitCode === null) vite.kill('SIGTERM');
};

try {
  if (action === 'dev') {
    vite = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5174', '--strictPort'], {
      cwd: root,
      stdio: 'inherit',
      windowsHide: true,
      env: { ...env, OPENCLAUDE_EDITION: 'desktop' },
    });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (vite.exitCode !== null) throw new Error('Desktop frontend server exited before it became ready.');
      try {
        const response = await fetch('http://127.0.0.1:5174/desktop/new', { signal: AbortSignal.timeout(1000) });
        if (response.ok) { ready = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!ready) throw new Error('Desktop frontend server did not become ready on port 5174.');
  }

  const command = action === 'check' ? 'cargo' : process.execPath;
  const args = action === 'check'
    ? ['check', '--manifest-path', 'src-tauri/Cargo.toml']
    : [join(root, 'node_modules/@tauri-apps/cli/tauri.js'), action];
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', env, windowsHide: true });
  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', code => resolve(code ?? 1));
  });
  process.exitCode = Number(exitCode);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  stopVite();
}
