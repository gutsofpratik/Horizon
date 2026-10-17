"""Conservative automatic KV budget; explicit context settings always win."""
def automatic_context(raw,native,metadata,weight_bytes,available_bytes):
    if raw.get('contextTokens') is not None:return int(raw['contextTokens'])
    minimum=min(native,int(raw.get('minimumContext',4096)))
    if not raw.get('autoFitContext',True):return minimum
    arch=metadata.get('general.architecture','')
    def number(key,default):
        try:return int(metadata.get(arch+'.'+key,default))
        except (ValueError,TypeError):return default
    layers=number('block_count',32);heads=max(1,number('attention.head_count',32));kv=max(1,number('attention.head_count_kv',heads))
    head=number('embedding_length',4096)//heads
    # F16 K and V is conservative even if quantized caches are selected.
    per_token=max(1,layers*kv*head*4)
    spare=max(0,available_bytes-weight_bytes-1024**3)
    fitted=int(spare//per_token)//256*256
    return max(minimum,min(native,fitted))
