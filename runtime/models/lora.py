"""Attach trained GGUF LoRA weights to the final continuous-batching context."""
import ctypes,math
from pathlib import Path

def apply_adapters(native,model,ctx,adapters):
    if not isinstance(adapters,list) or len(adapters)>8:raise ValueError('Invalid LoRA adapter list')
    handles=[];scales=[];loaded=[]
    try:
        for entry in adapters:
            if entry.get('enabled',True) is False:continue
            path=Path(entry['path']).resolve();scale=float(entry.get('scale',1))
            if not math.isfinite(scale) or abs(scale)>10:raise ValueError('Invalid LoRA scale')
            if path.suffix.lower()!='.gguf' or not path.is_file():raise ValueError(f'LoRA adapter GGUF file is unavailable: {path}')
            with path.open('rb') as file:
                if file.read(4)!=b'GGUF':raise ValueError(f'LoRA adapter is not a GGUF file: {path}')
            handle=native.llama_adapter_lora_init(model._model.model,str(path).encode('utf-8'))
            if not handle:raise ValueError(f'Cannot initialize LoRA adapter (incompatible base model or adapter format): {path}')
            handles.append(handle);scales.append(scale);loaded.append({'path':str(path),'scale':scale})
        if handles:
            pointers=(native.llama_adapter_lora_p_ctypes*len(handles))(*handles)
            weights=(ctypes.c_float*len(scales))(*scales)
            if native.llama_set_adapters_lora(ctx,pointers,len(handles),weights)!=0:raise ValueError('The native runtime rejected the LoRA adapters; no unadapted inference was started')
    except Exception:
        for handle in handles:native.llama_adapter_lora_free(handle)
        raise
    for handle in handles:model._stack.callback(native.llama_adapter_lora_free,handle)
    return loaded
