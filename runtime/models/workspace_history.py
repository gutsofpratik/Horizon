"""Bounded per-conversation workspace snapshots keep historical prompts stable."""
import hashlib,json,threading
from collections import OrderedDict

class WorkspaceHistory:
    def __init__(self,limit=1024*1024):self.limit=limit;self.entries=OrderedDict();self.latest=OrderedDict();self.size=0;self.lock=threading.Lock()
    def clear(self):
        with self.lock:self.entries.clear();self.latest.clear();self.size=0
    def apply(self,messages,workspace,scope):
        with self.lock:return self._apply(messages,workspace,scope)
    def _apply(self,messages,workspace,scope):
        users=[index for index,message in enumerate(messages) if message['role']=='user']
        if not users:return messages
        history_complete=True
        for index in users:
            message=messages[index];raw=message.get('content','')
            key=(scope,index,hashlib.sha256(json.dumps(raw,ensure_ascii=True).encode('utf-8')).digest())
            entry=self.entries.get(key) if scope else None
            context=entry['rendered'] if entry else None
            if index!=users[-1] and entry is None:history_complete=False
            if index==users[-1]:
                previous=self.latest.get(scope) if scope else None
                baseline=(entry['baseline'] if entry else previous[1] if previous and previous[0] in self.entries and index>previous[0][1] else '') if history_complete else ''
                old_sections=set(baseline.split('\n\n'))
                context='\n\n'.join(section for section in workspace.split('\n\n') if section not in old_sections)
                entry={'full':workspace,'rendered':context,'baseline':baseline,'size':len(workspace)+len(context)+len(baseline)}
            if context is None:continue
            if scope and index==users[-1] and entry['size']<=self.limit:
                previous=self.entries.pop(key,None)
                if previous is not None:self.size-=previous['size']
                self.entries[key]=entry;self.size+=entry['size'];self.latest[scope]=(key,workspace)
                while len(self.latest)>8:self.latest.popitem(last=False)
                while self.size>self.limit:
                    _,removed=self.entries.popitem(last=False);self.size-=removed['size']
            if not context:continue
            prefix='Application-provided workspace context:\nLive workspace context'+context+'\n\nUser request:\n'
            message['content']=[{'type':'text','text':prefix}]+raw if isinstance(raw,list) else prefix+str(raw)
        return messages
