def check_context_capacity(requested,allocated):
    """Allocation padding is allowed; reducing the configured logical context is not."""
    if allocated<requested:
        raise ValueError(f'Engine allocated only {allocated} tokens for requested context {requested}; no context reduction is allowed')
    return requested

def response_budget(context,output_limit,input_tokens,request_limit=None):
    remaining=context-input_tokens
    if remaining<=0:raise ValueError(f'Input ({input_tokens} tokens) fills the configured {context}-token context; no context reduction was applied')
    ceiling=int(output_limit)
    if request_limit is not None:
        if not isinstance(request_limit,int) or isinstance(request_limit,bool) or request_limit<1:raise ValueError('Response token limit must be a positive integer')
        ceiling=min(ceiling,request_limit)
    return min(ceiling,remaining)


def generation_budget(context,output_limit,input_tokens,request_limit=None,auto_compact=False):
    budget=response_budget(context,output_limit,input_tokens,request_limit)
    if not auto_compact:return budget,False
    threshold=int(context*.9)
    until_checkpoint=max(1,threshold-input_tokens)
    return min(budget,until_checkpoint),until_checkpoint<=budget
