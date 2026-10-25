"""Horizon-owned Transformers worker. JSON lines over private stdin/stdout."""
import os, sys, json, threading, traceback, gc, uuid
from pathlib import Path
from unicode_text import clean_unicode
from model_messages import normalize_system_messages
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
os.environ['HF_HUB_DISABLE_PROGRESS_BARS']='1'
protocol=sys.stdout
sys.stdout=sys.stderr
# Import native extension modules on the main thread before reading commands.
import torch, transformers, numpy
lock=threading.Lock()
state={'model':None,'tokenizer':None,'configuration':None,'id':None}
cancelled={}
def emit(id,**data):
    with lock:
        protocol.write(json.dumps({'id':id,**data},ensure_ascii=True)+'\n');protocol.flush()
def configuration(raw,native_context):
    context=int(raw.get('contextTokens',raw.get('num_ctx',native_context)))
    output=int(raw.get('outputTokens',raw.get('num_predict',context)))
    temperature=float(raw.get('temperature',0.7))
    if context<128 or output<1 or output>context: raise ValueError('Model JSON must specify context >=128 and output >0 within context')
    if not 0<=temperature<=2: raise ValueError('Model JSON temperature must be between 0 and 2')
    if context>native_context: raise ValueError(f'Requested {context} context exceeds this architecture configuration ({native_context}); change the model configuration or load a compatible model. No context reduction was applied.')
    return {'contextTokens':context,'outputTokens':output,'temperature':temperature,'device':raw.get('device','auto')}
operation=threading.Lock()
def handle(message):
    id=message['id'];action=message['action'];args=message.get('args',{})
    try:
        if action=='inspect_runtime':
            import torch,transformers,importlib.util
            emit(id,result={'torch':torch.__version__,'transformers':transformers.__version__,'cuda':torch.cuda.is_available(),'gguf':bool(importlib.util.find_spec('gguf'))});return
        if action=='download':
            from huggingface_hub import HfApi,hf_hub_download
            repo=args['repo'];revision=args['revision'];files=args['files'];directory=Path(args['directory']).resolve()
            if not revision or len(revision)!=40: raise ValueError('Download requires an immutable repository revision')
            for index,file in enumerate(files):
                if cancelled[id].is_set():raise ValueError('Download cancelled')
                if Path(file).is_absolute() or '..' in Path(file).parts or not file.lower().endswith(('.json','.safetensors','.gguf','.model','.txt','.tiktoken','.jinja')):raise ValueError('Unsupported model resource')
                emit(id,event='progress',data={'file':file,'completedFiles':index,'totalFiles':len(files)})
                hf_hub_download(repo_id=repo,filename=file,revision=revision,local_dir=str(directory))
            emit(id,result={'path':str(directory),'revision':revision});return
        if not operation.acquire(blocking=False):raise ValueError('Model runtime is busy; stop the current generation or load first')
        try:
            import torch
            from transformers import AutoModelForCausalLM,AutoTokenizer,GgufConfig,TextIteratorStreamer,StoppingCriteria,StoppingCriteriaList
            if action=='unload':
                state.update(model=None,tokenizer=None,configuration=None,id=None);gc.collect()
                if torch.cuda.is_available():torch.cuda.empty_cache()
                emit(id,result={'status':'unloaded'});return
            if action=='load':
                if state['model'] is not None:raise ValueError('Unload the current model before loading another')
                source=Path(args['path']).resolve();raw=args.get('configuration',{})
                device=raw.get('device','auto');device=('cuda' if torch.cuda.is_available() else 'cpu') if device=='auto' else device
                if device not in ('cpu','cuda'):raise ValueError('Choose CPU, CUDA, or auto in the model JSON')
                if device=='cuda' and not torch.cuda.is_available():raise ValueError('CUDA is unavailable in the installed PyTorch runtime')
                kwargs={'local_files_only':True,'trust_remote_code':False,'attn_implementation':'sdpa','dtype':torch.float32 if device=='cpu' else torch.bfloat16}
                if source.is_file() and source.suffix.lower()=='.gguf':
                    import gguf,psutil
                    reader=gguf.GGUFReader(str(source));dense=sum(int(t.n_elements)*4 for t in reader.tensors)
                    if device=='cpu' and dense>psutil.virtual_memory().available*0.8:raise ValueError(f'GGUF requires approximately {dense/1024**3:.1f} GiB for dense CPU weights, exceeding available memory. The GGUF loader dequantizes weights; no llama.cpp runtime is used.')
                    directory=str(source.parent);kwargs.update(gguf_file=source.name,quantization_config=GgufConfig(dequantize=True))
                    tokenizer=AutoTokenizer.from_pretrained(directory,gguf_file=source.name,local_files_only=True,trust_remote_code=False)
                elif source.is_dir():
                    if not (source/'config.json').is_file():raise ValueError('Safetensors directory is missing config.json')
                    if not list(source.glob('*.safetensors')):raise ValueError('Choose a directory containing safetensors weights')
                    directory=str(source);kwargs['use_safetensors']=True
                    tokenizer=AutoTokenizer.from_pretrained(directory,local_files_only=True,trust_remote_code=False)
                else:raise ValueError('Choose a GGUF file or a complete safetensors model directory')
                emit(id,event='progress',data={'stage':'Loading weights','device':device})
                model=AutoModelForCausalLM.from_pretrained(directory,**kwargs)
                text_config=getattr(model.config,'text_config',model.config)
                native_context=int(getattr(text_config,'max_position_embeddings',getattr(text_config,'n_positions',2048)))
                config=configuration(raw,native_context);model=model.to(device);model.eval()
                if tokenizer.pad_token_id is None:tokenizer.pad_token_id=tokenizer.eos_token_id
                template=tokenizer.chat_template or '';tool_support='tools' in template and '<tool_call>' in template
                state.update(model=model,tokenizer=tokenizer,configuration=config,id=args['modelId'])
                emit(id,result={'status':'loaded','modelId':state['id'],'configuration':config,'device':device,'nativeContext':native_context,'tools':tool_support,'format':'gguf' if source.is_file() else 'safetensors'});return
            if action!='generate':raise ValueError('Unknown model worker action')
            if state['model'] is None or args['model']!=state['id']:raise ValueError('Load the selected model in the model library before chatting')
            tokenizer=state['tokenizer'];model=state['model'];config=state['configuration'];messages=normalize_system_messages(clean_unicode(args['messages']));tools=args.get('tools',[])
            generation_kwargs={}
            if args.get('json'):
                if tools:raise ValueError('Use separate tool-call and constrained JSON requests')
                from json_constraint import json_prefix
                generation_kwargs['prefix_allowed_tokens_fn']=json_prefix(tokenizer)
            if any(isinstance(m.get('content'),list) for m in messages):raise ValueError('This built-in loader supports text models; choose a vision provider for images and computer screenshots')
            if tools and not ('tools' in (tokenizer.chat_template or '') and '<tool_call>' in (tokenizer.chat_template or '')):raise ValueError('This model has no native tool-call chat template. Turn off tools or load a tool-capable model.')
            if tokenizer.chat_template:prompt=tokenizer.apply_chat_template(messages,tools=tools or None,tokenize=False,add_generation_prompt=True)
            else:prompt='\n'.join(m['role']+': '+str(m.get('content','')) for m in messages)+'\nassistant: '
            inputs=tokenizer(prompt,return_tensors='pt');input_tokens=inputs['input_ids'].shape[1]
            from context_limits import response_budget
            max_output=response_budget(config['contextTokens'],config['outputTokens'],input_tokens,args.get('maxTokens'))
            inputs={key:value.to(model.device) for key,value in inputs.items()}
            class Stop(StoppingCriteria):
                def __call__(self,input_ids,scores,**kwargs):return cancelled[id].is_set()
            streamer=TextIteratorStreamer(tokenizer,skip_prompt=True,skip_special_tokens=not bool(tools),timeout=1)
            generation_errors=[]
            def generate():
                try:
                    with torch.inference_mode():model.generate(**inputs,**generation_kwargs,streamer=streamer,max_new_tokens=max_output,do_sample=config['temperature']>0,temperature=max(config['temperature'],0.001),pad_token_id=tokenizer.pad_token_id,stopping_criteria=StoppingCriteriaList([Stop()]))
                except Exception as error:generation_errors.append(error);streamer.end()
            thread=threading.Thread(target=generate,daemon=True);thread.start();output=''
            import queue
            while True:
                try:chunk=next(streamer)
                except StopIteration:break
                except queue.Empty:
                    if not thread.is_alive():break
                    continue
                output+=chunk
                # Tool-capable templates can emit structured tags. Buffer them for strict parsing.
                if not tools and not args.get('json'):emit(id,event='chunk',data={'content':chunk})
            thread.join()
            if generation_errors:raise generation_errors[0]
            if cancelled[id].is_set():raise ValueError('Generation cancelled')
            if args.get('json'):
                try:parsed=json.loads(output)
                except Exception as error:raise ValueError('The configured output limit ended before the constrained JSON object was complete; increase outputTokens in the model JSON') from error
                if not isinstance(parsed,dict):raise ValueError('JSON mode requires an object')
                emit(id,event='chunk',data={'content':output})
            calls=[]
            if tools:
                import re
                names={tool['function']['name'] for tool in tools}
                for payload in re.findall(r'<tool_call>\s*(.*?)\s*</tool_call>',output,re.S):
                    call=json.loads(payload);name=call.get('name');arguments=call.get('arguments',{})
                    if name not in names or not isinstance(arguments,dict):raise ValueError('Model emitted an invalid tool call; no tool was executed')
                    calls.append({'id':str(uuid.uuid4()),'type':'function','function':{'name':name,'arguments':json.dumps(arguments)}})
                text=re.sub(r'<tool_call>.*?</tool_call>','',output,flags=re.S)
                if '<tool_call>' in text:raise ValueError('Model tool call was incomplete; no tool was executed')
                # Remove known end-of-turn tokens, retaining user content.
                for special in tokenizer.all_special_tokens:text=text.replace(special,'')
                if text.strip():emit(id,event='chunk',data={'content':text})
                if calls:emit(id,event='chunk',data={'tool_calls':[{'index':i,**call} for i,call in enumerate(calls)]})
            emit(id,result={'finish_reason':'tool_calls' if calls else 'stop','inputTokens':input_tokens})
        finally:operation.release()
    except Exception as error:emit(id,error=str(error))
    finally:cancelled.pop(id,None)
for line in sys.stdin:
    try:
        message=json.loads(line)
        if message['action']=='cancel':
            event=cancelled.get(message['args']['requestId'])
            if event:event.set()
            continue
        cancelled[message['id']]=threading.Event()
        threading.Thread(target=handle,args=(message,),daemon=True).start()
    except Exception as error:emit('protocol',error=str(error))
