"""Observe free device memory without loading another GPU framework."""
import subprocess,os
MIB=1024**2
def gpu_memory():
    try:
        flags={'creationflags':subprocess.CREATE_NO_WINDOW} if os.name=='nt' else {}
        output=subprocess.check_output(['nvidia-smi','--query-gpu=index,memory.total,memory.free','--format=csv,noheader,nounits'],timeout=3,**flags).decode()
        return [dict(zip(('index','total','free'),map(int,line.split(',')))) for line in output.strip().splitlines()]
    except (OSError,ValueError,subprocess.SubprocessError):return []

def parallel_capacity(requested,before,after,weight_bytes,context):
    """Conservative KV admission estimate; native allocation remains authoritative."""
    target=4 if requested is None else requested
    if target==1:return 1
    if not before or not after:return 1 if requested is None else target
    old={gpu['index']:gpu for gpu in before}
    used=sum(max(0,old[gpu['index']]['free']-gpu['free']) for gpu in after if gpu['index'] in old)*MIB
    cache=max(128*MIB,used-weight_bytes)
    spare=sum(max(0,gpu['free']-768) for gpu in after)*MIB
    return max(1,min(target,1+int(spare//cache)))
