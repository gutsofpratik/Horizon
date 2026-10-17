def flash_attention(raw,layers):
    mode=raw.get('flashAttention','auto')
    if mode not in ('auto','on','off'):raise ValueError('Invalid Flash Attention setting')
    if mode=='on' and layers==0:raise ValueError('Flash Attention is requested but GPU offload is disabled')
    return layers!=0 and mode!='off'

def loading_attempts(raw,placements):
    for layers,cache in placements:
        requested=flash_attention(raw,layers)
        yield layers,cache,requested
        # Automatic mode can retry unsupported FA without silently changing
        # device, layer count or context. Quantized V cache needs FA.
        if requested and raw.get('flashAttention','auto')=='auto' and raw.get('cacheType','auto')=='auto':
            yield layers,'f16',False

def gpu_placements(raw,gpu,block_count,context):
    """Keep an available GPU in use; never silently fall back to CPU."""
    device=raw.get('device','auto')
    layers=0 if device=='cpu' else int(raw.get('gpuLayers',-1 if gpu else 0))
    cache=raw.get('cacheType','auto')
    if raw.get('flashAttention')=='off':
        if cache not in ('auto','f16'):raise ValueError('Quantized KV cache requires Flash Attention. Choose F16 cache or enable Flash Attention.')
        cache='f16'
    if cache=='auto':cache='q8_0' if layers!=0 and context>32768 else 'f16'
    choices=[(layers,cache)]
    if layers!=0 and raw.get('cacheType','auto')=='auto' and cache=='f16' and raw.get('flashAttention')!='off':choices.append((layers,'q8_0'))
    if 'gpuLayers' not in raw and layers!=0:
        if raw.get('memoryMode')=='balanced':
            choices.extend((max(1,int(block_count*ratio)),choices[-1][1]) for ratio in (0.75,0.5,0.25))
            choices.append((1,choices[-1][1]))
            if device=='auto':choices.append((0,choices[-1][1]))
        elif device=='auto':choices.append((max(1,block_count//2),choices[-1][1]))
    return list(dict.fromkeys(choices))
