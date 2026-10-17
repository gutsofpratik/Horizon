"""Bootstrap the explicitly selected, pinned Prism backend in this worker only."""
import ctypes,hashlib,json,os,sys
from pathlib import Path
handles=[]
def activate(root):
    if sys.platform!='win32':raise ValueError('This installed Prism build requires Windows and NVIDIA CUDA')
    folder=Path(os.environ.get('OPENCLAUDE_DATA_DIR',str(Path(root).resolve()/'.local')))/'prism';binary=folder/'bin'
    manifest=json.loads((folder/'binding-manifest.json').read_text())
    if manifest.get('commit')!='e3de71522' or hashlib.sha256((binary/'llama.dll').read_bytes()).hexdigest()!=manifest.get('llamaSha256'):
        raise ValueError('Prism runtime changed; regenerate compatible bindings before loading')
    sys.path.insert(0,str(folder/'bindings'))
    os.environ['LLAMA_CPP_LIB_PATH']=str(binary);os.environ['MTMD_CPP_LIB']=str(binary)
    handles.append(os.add_dll_directory(str(binary)))
    import llama_cpp
    ggml=ctypes.CDLL(str(binary/'ggml.dll'))
    ggml.ggml_backend_load_all_from_path.argtypes=[ctypes.c_char_p]
    ggml.ggml_backend_load_all_from_path(str(binary).encode('utf-8'))
    handles.append(ggml)
    if not llama_cpp.llama_supports_gpu_offload():raise ValueError('Prism CUDA backend could not initialize')
