"""Downloads use a separate process so inference switches cannot terminate them."""
import sys,json,threading
from pathlib import Path,PurePosixPath
protocol=sys.stdout
sys.stdout=sys.stderr
lock=threading.Lock()
cancelled={}
def emit(id,**data):
    with lock:protocol.write(json.dumps({'id':id,**data})+'\n');protocol.flush()
def download(message,event):
    id=message['id']
    try:
        if message['action']!='download':raise ValueError('Only model downloads are supported by this process')
        from huggingface_hub import hf_hub_download
        args=message['args'];directory=Path(args['directory']).resolve()
        for index,file in enumerate(args['files']):
            if event.is_set():raise ValueError('Download cancelled')
            normalized=file.replace('\\','/');path=PurePosixPath(normalized)
            if path.is_absolute() or '..' in path.parts or ':' in normalized or not normalized.lower().endswith(('.json','.safetensors','.gguf','.model','.txt','.tiktoken','.jinja')):raise ValueError('Unsupported model resource')
            emit(id,event='progress',data={'file':file,'completedFiles':index,'totalFiles':len(args['files'])})
            hf_hub_download(repo_id=args['repo'],revision=args['revision'],filename=normalized,local_dir=str(directory))
        emit(id,result={'path':str(directory),'revision':args['revision']})
    except Exception as error:emit(id,error=str(error))
    finally:cancelled.pop(id,None)
for line in sys.stdin:
    try:
        message=json.loads(line)
        if message['action']=='cancel':
            event=cancelled.get(message['args']['requestId'])
            if event:event.set()
        else:
            event=threading.Event();cancelled[message['id']]=event;threading.Thread(target=download,args=(message,event),daemon=True).start()
    except Exception as error:emit('protocol',error=str(error))
