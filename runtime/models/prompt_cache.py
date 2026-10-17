"""Bounded, memory-only sequence reuse. Exact tokens and conversation scope are required."""
import ctypes

def common_prefix(left,right):
    for index,(a,b) in enumerate(zip(left,right)):
        if a!=b:return index
    return min(len(left),len(right))

class RecurrentState:
    """Save only recurrent/SWA state; the attention KV tensors remain on their device."""
    def __init__(self,api,ctx,byte_limit):self.api=api;self.ctx=ctx;self.byte_limit=byte_limit
    def save(self,slot):
        size=self.api.llama_state_seq_get_size_ext(self.ctx,slot,1)
        if not size or size>self.byte_limit:return None
        data=(ctypes.c_uint8*size)()
        if self.api.llama_state_seq_get_data_ext(self.ctx,data,size,slot,1)!=size:return None
        return data
    def restore(self,slot,data):return self.api.llama_state_seq_set_data_ext(self.ctx,data,len(data),slot,1)==len(data)

class PromptCache:
    def __init__(self,ctx,state=None,byte_limit=256*1024*1024):
        self.ctx=ctx;self.state=state;self.byte_limit=byte_limit;self.entries={};self.checkpoints={}
    def reusable(self,slot,prompt,scope):
        entry=self.entries.get(slot)
        if not scope or not entry or entry['scope']!=scope:return 0
        prefix=min(common_prefix(entry['tokens'],prompt),max(0,len(prompt)-1))
        if self.state:
            matches=[item['position'] for item in self.checkpoints.get(slot,[]) if item['scope']==scope and item['position']<=prefix]
            return max(matches,default=0)
        return prefix
    def choose(self,free,prompt,scope):return max(free,key=lambda slot:self.reusable(slot,prompt,scope))
    def begin(self,slot,prompt,scope):
        prefix=self.reusable(slot,prompt,scope)
        try:
            checkpoint=next((item for item in self.checkpoints.get(slot,[]) if item['position']==prefix and item['scope']==scope),None)
            if prefix and self.state and not self.state.restore(slot,checkpoint['data']):prefix=0
            if prefix and not self.ctx.kv_cache_seq_rm(slot,prefix,-1):prefix=0
        except Exception:prefix=0
        self.entries.pop(slot,None)
        retained=[item for item in self.checkpoints.get(slot,[]) if item['scope']==scope and item['position']<=prefix]
        if retained:self.checkpoints[slot]=retained
        else:self.checkpoints.pop(slot,None)
        if not prefix and not self.ctx.kv_cache_seq_rm(slot,0,-1):raise ValueError('Native sequence could not be cleared before prompt processing')
        return prefix
    def capture(self,slot,tokens,scope):
        if not self.state or not scope or not tokens:return False
        existing=[item for item in self.checkpoints.get(slot,[]) if item['scope']==scope]
        if any(item['position']==len(tokens) for item in existing):return True
        try:data=self.state.save(slot)
        except Exception:return False
        if data is None:return False
        # Keep the earliest policy checkpoint if a larger snapshot cannot fit.
        retained=existing[:2] if len(existing)>=3 else existing
        other_bytes=sum(len(item['data']) for other,items in self.checkpoints.items() if other!=slot for item in items)
        if len(data)+other_bytes+sum(len(item['data']) for item in retained)>self.byte_limit:return False
        self.checkpoints[slot]=sorted(retained+[{'scope':scope,'position':len(tokens),'data':data}],key=lambda item:item['position'])[:3]
        return True
    def finish(self,slot,tokens,scope):
        if not scope or self.state and slot not in self.checkpoints:
            self.discard(slot);return
        self.entries[slot]={'scope':scope,'tokens':list(tokens)}
    def discard(self,slot):
        self.entries.pop(slot,None);self.checkpoints.pop(slot,None)
        if not self.ctx.kv_cache_seq_rm(slot,0,-1):raise ValueError('Native sequence state could not be released')

