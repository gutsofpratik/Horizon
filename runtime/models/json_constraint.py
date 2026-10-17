"""Transformers 5 adapter for lm-format-enforcer's public token-enforcer API.

The upstream Transformers integration imports a tokenizer class from a removed
Transformers 4 module. Keep token enforcement without modifying installed packages.
Upstream integration: https://github.com/noamgat/lm-format-enforcer (MIT).
"""
from lmformatenforcer import JsonSchemaParser, TokenEnforcer, TokenEnforcerTokenizerData
def json_prefix(tokenizer):
    cached=getattr(tokenizer,'_openclaude_json_data',None)
    if cached is not None:
        enforcer=TokenEnforcer(cached,JsonSchemaParser({'type':'object','additionalProperties':True}))
        return lambda batch_id,input_ids:enforcer.get_allowed_tokens(input_ids.tolist()).allowed_tokens
    prefix_ids=tokenizer.encode('0',add_special_tokens=False)
    if not prefix_ids:raise ValueError('Tokenizer cannot initialize JSON constraints')
    prefix=prefix_ids[-1]
    decoded_prefix=tokenizer.decode([prefix])
    special=set(tokenizer.all_special_ids)
    regular=[]
    for index in range(len(tokenizer)):
        if index in special:continue
        decoded=tokenizer.decode([index])
        after_prefix=tokenizer.decode([prefix,index])[len(decoded_prefix):]
        regular.append((index,after_prefix,len(after_prefix)>len(decoded)))
    data=TokenEnforcerTokenizerData(regular,lambda ids:tokenizer.decode(ids).rstrip('�'),tokenizer.eos_token_id,False,len(tokenizer))
    tokenizer._openclaude_json_data=data
    enforcer=TokenEnforcer(data,JsonSchemaParser({'type':'object','additionalProperties':True}))
    def allowed(batch_id,input_ids):return enforcer.get_allowed_tokens(input_ids.tolist()).allowed_tokens
    return allowed
