"""Private JSON-lines inference worker. Direct library calls; no HTTP listener."""
import sys,os,json,threading,gc,platform,uuid,site,time
import hashlib
from pathlib import Path
from unicode_text import clean_unicode
from model_messages import normalize_system_messages,template_history
from workspace_history import WorkspaceHistory
from prompt_messages import prepare_messages,format_model_prompt
from native_tools import detect_protocol,NativeToolStream,decode_native_calls,_json_decoder
protocol=sys.stdout
sys.stdout=sys.stderr
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
if os.environ.get('OPENCLAUDE_LLAMA_VARIANT')=='prism':
    from prism_runtime import activate
    activate(Path(__file__).resolve().parents[2])
# CUDA wheels keep NVIDIA libraries in separate Python packages on Windows.
dll_dirs=[]
if sys.platform=='win32':
    for root in site.getsitepackages():
        for folder in {file.parent for file in Path(root,'nvidia').rglob('*.dll')}:
            dll_dirs.append(os.add_dll_directory(str(folder)))
            os.environ['PATH']=str(folder)+os.pathsep+os.environ.get('PATH','')
write_lock=threading.Lock();operation=threading.Lock();cancelled={}
state={'model':None,'engine':None,'tokenizer':None,'config':None,'id':None,'decoder':None,'vision':None}
grammar_cache={};grammar_lock=threading.Lock()
workspace_history=WorkspaceHistory()
def emit(id,**message):
    with write_lock:protocol.write(json.dumps({'id':id,**message},ensure_ascii=True)+'\n');protocol.flush()
def settings(raw,native_context):
    context=int(raw.get('contextTokens',native_context));output=int(raw.get('outputTokens',context))
    if context<128 or output<1 or output>context:raise ValueError('Output must be positive and within the configured context window')
    if context>native_context:raise ValueError(f'Requested context {context} exceeds model context {native_context}; no context reduction was applied')
    return {**raw,'contextTokens':context,'outputTokens':output,'temperature':float(raw.get('temperature',0.7))}
def load(args,progress):
    path=str(Path(args['path']).resolve());raw=args.get('configuration',{});engine=args['engine']
    progress('Reading model metadata')
    if engine=='llama.cpp':
        import llama_cpp
        from memory_plan import gpu_memory,parallel_capacity
        memory_before=gpu_memory()
        # Vocabulary-only inspection does not allocate the full context or expand quantized weights.
        probe=llama_cpp.Llama(model_path=path,vocab_only=True,n_ctx=128,verbose=False)
        metadata=dict(probe.metadata);arch=metadata.get('general.architecture','');native=int(metadata.get(arch+'.context_length',2048));probe.close()
        from auto_context import automatic_context
        available=sum(item['free'] for item in memory_before)*1024**2
        if raw.get('device')=='cpu' or not available:
            import psutil
            available=psutil.virtual_memory().available
        effective_context=automatic_context(raw,native,metadata,Path(path).stat().st_size,available)
        config=settings({**raw,'contextTokens':effective_context},native);device=raw.get('device','auto');gpu=llama_cpp.llama_supports_gpu_offload()
        if device in ('cuda','metal') and not gpu:raise ValueError('This llama.cpp build has no GPU backend. Install a compatible GPU runtime or select CPU.')
        layers=0 if device=='cpu' else int(raw.get('gpuLayers',-1 if gpu else 0))
        if layers!=0 and not gpu:raise ValueError('GPU layers requested but no GPU backend is available')
        progress('Loading quantized weights with llama.cpp')
        block_count=int(metadata.get(arch+'.block_count',32))
        from inference_options import gpu_placements,loading_attempts
        placements=gpu_placements(raw,gpu,block_count,config['contextTokens'])
        cache_types={'f16':llama_cpp.GGML_TYPE_F16,'q8_0':llama_cpp.GGML_TYPE_Q8_0,'q4_0':llama_cpp.GGML_TYPE_Q4_0}
        model=None;last_error=None
        for attempt_layers,cache_type,flash in loading_attempts(raw,placements):
            kv_gpu=attempt_layers!=0
            progress(f'Allocating exact {config["contextTokens"]} context · GPU layers {attempt_layers} · {cache_type} KV cache {"GPU" if kv_gpu else "CPU"}')
            try:
                model=llama_cpp.Llama(model_path=path,n_ctx=config['contextTokens'],n_gpu_layers=attempt_layers,n_threads=raw.get('threads'),n_batch=int(raw.get('batchSize',512)),n_ubatch=int(raw.get('microBatchSize',128)),offload_kqv=kv_gpu,flash_attn=flash,swa_full=False,type_k=cache_types[cache_type],type_v=cache_types[cache_type],verbose=True)
                layers=attempt_layers;break
            except Exception as error:
                last_error=error;gc.collect()
                if not any(term in str(error).lower() for term in ('llama_context','memory','alloc','flash','not supported','unsupported')):raise
        if model is None:raise ValueError(f'Cannot allocate the requested {config["contextTokens"]}-token context with the selected GPU settings. Adjust GPU layers, KV cache precision or processing batch size. Neither context nor compute device was silently reduced. Native error: {last_error}')
        model.verbose=False
        from context_limits import check_context_capacity
        check_context_capacity(config['contextTokens'],model.n_ctx())
        from multimodal import resolve_projector,VisionProjector
        projector_path=resolve_projector(path,raw.get('visionProjectorPath'),args.get('projectorLayers'))
        projector=None
        if projector_path and raw.get('visionEnabled',True):
            progress('Loading vision projector on '+('GPU' if layers!=0 else 'CPU'))
            try:projector=VisionProjector(model,projector_path,layers!=0,int(raw.get('imageMaxTokens',2048)))
            except Exception:model.close();raise
        from batched_decode import BatchedDecoder
        slots=parallel_capacity(raw.get('parallelPredictions'),memory_before,gpu_memory(),model._model.size() if layers==-1 else 0,config['contextTokens'])
        decoder=None
        for count in range(slots,0,-1):
            try:
                progress(f'Configuring continuous batching · {count} slots · {config["contextTokens"]} context per request')
                decoder=BatchedDecoder(model,config['contextTokens'],count);slots=count;break
            except Exception as error:
                if count==1:model.close();raise ValueError(f'Cannot allocate the configured context for continuous batching: {error}') from error
                gc.collect()
        from lora import apply_adapters
        try:loaded_adapters=apply_adapters(llama_cpp,model,decoder.ctx.ctx,raw.get('loraAdapters',[]))
        except Exception:
            decoder.close();model.close();raise
        config['loadedAdapters']=loaded_adapters
        template=metadata.get('tokenizer.chat_template','');tools='tools' in template
        protocol=detect_protocol(template)
        # Verified native protocols stream plain answers; others retain constrained fallback.
        caps=[cap for cap in raw.get('capabilities',['tools']) if cap not in ('vision','thinking')];reasoning_supported='enable_thinking' in template or '<think>' in template
        if projector:caps.append('vision')
        if reasoning_supported:caps.append('thinking')
        config['capabilities']=caps;config['reasoningMode']='native' if reasoning_supported else None;config['visionProjectorPath']=projector_path;config['visionEnabled']=bool(projector)
        config['toolProtocol']=protocol
        state.update(toolProtocol=protocol,model=model,decoder=decoder,tokenizer=None,engine=engine,config=config,id=args['modelId'],importedSystem=args.get('importedSystem'),vision=projector)
        return {'modelId':args['modelId'],'status':'loaded','engine':engine,'configuration':config,'allocatedContext':model.n_ctx(),'nativeContext':native,'parallelPredictions':slots,'batching':'continuous','tools':'tools' in caps,'capabilities':caps,'reasoningMode':config['reasoningMode'],'vision':{'enabled':bool(projector),'projectorPath':projector_path,'device':('cuda' if os.name=='nt' else 'gpu') if layers!=0 else 'cpu'},'device':('cuda' if os.name=='nt' else 'gpu') if layers!=0 else 'cpu','gpuLayers':layers,'kvDevice':'gpu' if kv_gpu else 'cpu','cacheType':cache_type,'flashAttention':raw.get('flashAttention','auto'),'flashAttentionRequested':flash,'promptCache':raw.get('promptCache',True),'microBatchSize':int(raw.get('microBatchSize',128)),'toolProtocol':protocol,'format':'gguf','quantized':True,'architecture':arch}
    if engine!='mlx':raise ValueError('Unsupported native engine')
    if platform.system()!='Darwin' or platform.machine() not in ('arm64','aarch64'):raise ValueError('MLX requires an Apple Silicon Mac')
    from mlx_lm import load as mlx_load
    metadata=json.loads(Path(path,'config.json').read_text());text=metadata.get('text_config',metadata);native=int(text.get('max_position_embeddings',2048));config=settings(raw,native)
    progress('Loading MLX weights');model,tokenizer=mlx_load(path,tokenizer_config={'trust_remote_code':False})
    template=tokenizer.chat_template or ''
    caps=raw.get('capabilities',['tools'] if 'tools' in template and '<tool_call>' in template else [])
    if 'tools' in caps and not ('tools' in template and '<tool_call>' in template):raise ValueError('MLX tool calls currently require a compatible <tool_call> JSON chat template')
    config['capabilities']=caps;state.update(model=model,tokenizer=tokenizer,engine=engine,config=config,id=args['modelId'])
    return {'modelId':args['modelId'],'status':'loaded','engine':engine,'configuration':config,'nativeContext':native,'tools':'tools' in caps,'capabilities':caps,'device':'metal','format':'safetensors'}
def generate(args,id):
    args=clean_unicode(args)
    args={**args,'messages':normalize_system_messages(args['messages'])}
    if not args.get('measure'):emit(id,event='chunk',data={'openclaude_phase':'preparing'})
    config=state['config'];tools=args.get('tools',[])
    if tools and 'tools' not in config.get('capabilities',[]):
        raise ValueError('This model has no detected tool template. Set a verified tools capability override in its settings or disable tools.')
    if state['engine']=='llama.cpp':
        import llama_cpp
        from llama_cpp.llama_chat_format import Jinja2ChatFormatter
        model=state['model'];messages=clean_unicode([dict(message) for message in args['messages']]);grammar=None
        protocol='envelope' if args.get('toolProtocol')=='envelope' else state.get('toolProtocol','envelope')
        messages=prepare_messages(messages,tools,args.get('cacheScope') if config.get('promptCache',True) else None,workspace_history,args.get('toolChoice')=='required',protocol)
        imported_system=state.get('importedSystem')
        if imported_system:
            if messages and messages[0]['role']=='system':messages[0]['content']+='\n\nImported model default instructions:\n'+imported_system
            else:messages.insert(0,{'role':'system','content':imported_system})
        images=[];projector=state.get('vision')
        if any(isinstance(message.get('content'),list) for message in messages):
            if not projector:raise ValueError('This model has no loaded vision projector. Attach a matching projector in Models settings before sending images.')
            messages,images=projector.messages(messages)
        native_thinking=bool(args.get('thinking')) and config.get('reasoningMode')=='native'
        messages=template_history(messages,protocol)
        policy_content=messages[0]['content'] if messages and messages[0]['role']=='system' else ''
        native_tools=bool(tools) and protocol=='qwen_xml'
        structured=bool(tools) and not native_tools
        required_call=args.get('toolChoice')=='required'
        if structured:
            from tool_envelope import tool_envelope
            required_call=args.get('toolChoice')=='required'
            schema=tool_envelope(tools,False,required_call)
            from sampling_schema import sampling_schema
            if not args.get('measure'):
                encoded=json.dumps(sampling_schema(schema),sort_keys=True)
                key=hashlib.sha256(encoded.encode('utf-8')).hexdigest()
                with grammar_lock:
                    grammar=grammar_cache.get(key)
                    if grammar is None:
                        grammar=llama_cpp.LlamaGrammar.from_json_schema(encoded,verbose=False)
                        if len(grammar._grammar)>262144:raise ValueError('Tool sampling grammar is too large; reduce the enabled tool schemas')
                        if len(grammar_cache)>=4:grammar_cache.pop(next(iter(grammar_cache)))
                        grammar_cache[key]=grammar
        elif args.get('json'):grammar=llama_cpp.LlamaGrammar.from_json_schema('{"type":"object"}',verbose=False)
        template=model.metadata.get('tokenizer.chat_template')
        if not template:raise ValueError('This GGUF has no chat template; a compatible chat template is required')
        formatter=Jinja2ChatFormatter(template=template,eos_token=model.detokenize([model.token_eos()],special=True).decode('utf-8',errors='replace'),bos_token=model.detokenize([model.token_bos()],special=True).decode('utf-8',errors='replace'))
        # Native reasoning runs before the constrained answer/tool envelope.
        # The decoder activates the JSON grammar only after </think>.
        formatted=format_model_prompt(formatter,messages,tools,protocol,native_thinking)
        prompt=projector.prepare(clean_unicode(formatted.prompt),images,config['contextTokens']) if images else model.tokenize(clean_unicode(formatted.prompt).encode('utf-8'),add_bos=not formatted.added_special,special=True)
        if args.get('measure'):
            count=len(prompt)
            if hasattr(prompt,'close'):prompt.close()
            return {'inputTokens':count,'contextTokens':config['contextTokens']}
        system_boundary=0;policy_boundary=0
        if not images and messages and messages[0]['role']=='system':
            # Save recurrent state before volatile workspace data and tool schemas.
            stable=messages[0]['content'].split('\n\nLive workspace context')[0]
            stable_prompt=formatter(messages=[{'role':'system','content':stable},{'role':'user','content':''}],enable_thinking=native_thinking)
            stable_tokens=model.tokenize(clean_unicode(stable_prompt.prompt).encode('utf-8'),add_bos=not stable_prompt.added_special,special=True)
            from prompt_cache import common_prefix
            system_boundary=common_prefix(prompt,stable_tokens)
            # Stop inside the policy text, before the system closing token.
            # Otherwise adding tool schemas changes that closing-token position
            # and invalidates a checkpoint a few tokens beyond the real prefix.
            policy_prompt=formatter(messages=[{'role':'system','content':policy_content+'\nHorizon policy checkpoint boundary.'},{'role':'user','content':''}],enable_thinking=native_thinking)
            policy_tokens=model.tokenize(clean_unicode(policy_prompt.prompt).encode('utf-8'),add_bos=not policy_prompt.added_special,special=True)
            policy_boundary=common_prefix(prompt,policy_tokens)
        from context_limits import generation_budget
        max_output,compaction_checkpoint=generation_budget(config['contextTokens'],config['outputTokens'],len(prompt),args.get('maxTokens'),args.get('autoCompact') is True)
        stop=llama_cpp.StoppingCriteriaList([lambda *_:cancelled[id].is_set()])
        sampling={target:config[key] for key,target in [('topP','top_p'),('topK','top_k'),('repeatPenalty','repeat_penalty'),('seed','seed')] if key in config}
        stops=list(dict.fromkeys((formatted.stop or [])+config.get('stop',[])))
        emit(id,event='chunk',data={'openclaude_phase':'prefill'})
        response=state['decoder'].completion(prompt=prompt,max_tokens=max_output,temperature=config['temperature'],grammar=grammar,stop=stops,cancel=cancelled[id],native_thinking=native_thinking,cache_scope=args.get('cacheScope') if config.get('promptCache',True) else None,system_boundary=system_boundary,policy_boundary=policy_boundary,**sampling)
        from json_text_stream import JsonTextStream
        from reasoning_stream import ReasoningStream
        reasoning=ReasoningStream(native_thinking);visible=JsonTextStream();native_stream=NativeToolStream();finish='stop';output='';generation_started=time.monotonic();last_progress=generation_started;started_decoding=False;metrics={}
        for chunk in response:
            if chunk.get('openclaude_progress'):
                emit(id,event='chunk',data={'openclaude_progress':chunk['openclaude_progress']});continue
            if not started_decoding:emit(id,event='chunk',data={'openclaude_phase':'decoding'});started_decoding=True
            if cancelled[id].is_set():raise ValueError('Generation cancelled')
            if chunk.get('usage'):metrics=chunk['usage']
            choice=chunk['choices'][0];parts=reasoning.feed(choice.get('text',''));text=parts['content']
            if parts['reasoning']:emit(id,event='chunk',data={'reasoning_content':parts['reasoning']})
            output+=text
            if text and native_tools:
                content=native_stream.feed(text)
                if content:emit(id,event='chunk',data={'content':content})
            elif text and structured:
                fields=visible.feed(text)
                if fields.get('reasoning'):emit(id,event='chunk',data={'reasoning_content':fields['reasoning']})
                if fields.get('content'):emit(id,event='chunk',data={'content':fields['content']})
            elif text and not args.get('json'):emit(id,event='chunk',data={'content':text})
            now=time.monotonic()
            if now-last_progress>=1:
                phase='reasoning' if reasoning.active else 'tool_arguments' if structured and visible.pending_key in ('tool_calls','tool_call') and visible.depth>1 else 'decoding'
                emit(id,event='chunk',data={'openclaude_progress':{'phase':phase,'generatedCharacters':len(output),'elapsedSeconds':int(now-generation_started)}});last_progress=now
            if choice.get('finish_reason'):finish=choice['finish_reason']
        if cancelled[id].is_set():raise ValueError('Generation cancelled')
        if finish=='length' and compaction_checkpoint:
            return {'finish_reason':'context_compaction','inputTokens':len(prompt),'usage':metrics}
        if reasoning.active:raise ValueError('The model ended before closing its native reasoning block. No incomplete tools were executed.')
        if native_tools:
            trailing=native_stream.flush()
            if trailing:emit(id,event='chunk',data={'content':trailing})
            parsed_calls=decode_native_calls(output,tools)
            if required_call and not parsed_calls:raise ValueError('A native tool call was required but the model returned no complete call. No tool executed.')
            if parsed_calls:
                calls=[{'index':index,'id':str(uuid.uuid4()),'type':'function','function':{'name':call['name'],'arguments':json.dumps(call['arguments']),**({'argument_error':call['argument_error']} if call.get('argument_error') else {})}} for index,call in enumerate(parsed_calls)]
                emit(id,event='chunk',data={'tool_calls':calls});finish='tool_calls'
        elif structured or args.get('json'):

            try:parsed=clean_unicode(_json_decoder().decode(output))
            except ValueError as error:
                reason='The response reached its token limit' if finish=='length' else 'The model stopped before returning a complete structured response'
                detail=f'{error.msg} at character {error.pos}' if isinstance(error,json.JSONDecodeError) else str(error)
                raise ValueError(f'{reason} ({detail}; response length {len(output)}). No tools were executed. Return one complete object with the offered schema.') from error
            if not isinstance(parsed,dict):raise ValueError('Structured output must be an object')
            if structured:
                calls=[];names={tool['function']['name'] for tool in tools}
                raw_calls=[parsed.get('tool_call')] if required_call else parsed.get('tool_calls',[])
                if not isinstance(raw_calls,list):raise ValueError('Invalid tool call; no action executed')
                for call in raw_calls:
                    if not isinstance(call,dict) or call.get('name') not in names or not isinstance(call.get('arguments'),dict):raise ValueError('Invalid tool call; no action executed')
                    calls.append({'index':len(calls),'id':str(uuid.uuid4()),'type':'function','function':{'name':call['name'],'arguments':json.dumps(call['arguments'])}})
                if calls:emit(id,event='chunk',data={'tool_calls':calls});finish='tool_calls'
            else:emit(id,event='chunk',data={'content':output})
        return {'finish_reason':finish,'inputTokens':len(prompt),'usage':metrics}
    from mlx_lm import stream_generate
    from mlx_lm.sample_utils import make_sampler
    tokenizer=state['tokenizer'];messages=args['messages']
    if args.get('json'):raise ValueError('Constrained JSON is not enabled for the MLX backend')
    prompt=tokenizer.apply_chat_template(messages,tools=tools or None,add_generation_prompt=True,tokenize=True)
    from context_limits import response_budget
    max_output=response_budget(config['contextTokens'],config['outputTokens'],len(prompt),args.get('maxTokens'))
    output=''
    for response in stream_generate(state['model'],tokenizer,prompt=prompt,max_tokens=max_output,sampler=make_sampler(temp=config['temperature'])):
        if cancelled[id].is_set():raise ValueError('Generation cancelled')
        output+=response.text
        if not tools:emit(id,event='chunk',data={'content':response.text})
    if cancelled[id].is_set():raise ValueError('Generation cancelled')
    calls=[]
    if tools:
        import re
        names={tool['function']['name'] for tool in tools}
        for payload in re.findall(r'<tool_call>\s*(.*?)\s*</tool_call>',output,re.S):
            call=json.loads(payload)
            if call.get('name') not in names or not isinstance(call.get('arguments',{}),dict):raise ValueError('Invalid tool call; no action executed')
            calls.append({'index':len(calls),'id':str(uuid.uuid4()),'type':'function','function':{'name':call['name'],'arguments':json.dumps(call.get('arguments',{}))}})
        text=re.sub(r'<tool_call>.*?</tool_call>','',output,flags=re.S)
        if '<tool_call>' in text:raise ValueError('Incomplete tool call; no action executed')
        if text.strip():emit(id,event='chunk',data={'content':text})
        if calls:emit(id,event='chunk',data={'tool_calls':calls})
    return {'finish_reason':'tool_calls' if calls else 'stop','inputTokens':len(prompt)}
def handle(message):
    id=message['id'];action=message['action'];args=message.get('args',{})
    try:
        if action=='download':
            from huggingface_hub import hf_hub_download
            for index,file in enumerate(args['files']):
                if cancelled[id].is_set():raise ValueError('Download cancelled')
                if Path(file).is_absolute() or '..' in Path(file).parts or not file.lower().endswith(('.json','.safetensors','.gguf','.model','.txt','.tiktoken','.jinja')):raise ValueError('Invalid model resource path')
                emit(id,event='progress',data={'file':file,'completedFiles':index,'totalFiles':len(args['files'])})
                hf_hub_download(repo_id=args['repo'],revision=args['revision'],filename=file,local_dir=args['directory'])
            emit(id,result={'path':args['directory']});return
        if action in ('generate','measure') and state.get('decoder') is not None:
            if state['id']!=args['model']:raise ValueError('Selected model is not loaded')
            emit(id,result=generate({**args,**({'measure':True} if action=='measure' else {})},id));return
        if not operation.acquire(blocking=False):raise ValueError('Inference engine is busy')
        try:
            if action=='inspect_runtime':
                import importlib.util
                emit(id,result={'transport':'private-stdio','llamaCpp':bool(importlib.util.find_spec('llama_cpp')),'mlx':bool(importlib.util.find_spec('mlx_lm'))});return
            if action=='unload':
                if state.get('decoder') is not None:state['decoder'].close()
                if state['engine']=='llama.cpp' and state['model'] is not None:state['model'].close()
                state.update(model=None,decoder=None,tokenizer=None,engine=None,config=None,id=None,vision=None);grammar_cache.clear();workspace_history.clear();gc.collect();emit(id,result={'status':'unloaded'});return
            if action=='load':
                if state['model'] is not None:raise ValueError('Unload the current model first')
                result=load(args,lambda stage:emit(id,event='progress',data={'stage':stage}));emit(id,result=result);return
            if action=='generate':
                if state['model'] is None or state['id']!=args['model']:raise ValueError('Selected model is not loaded')
                emit(id,result=generate(args,id));return
            raise ValueError('Unknown native worker action')
        finally:operation.release()
    except Exception as error:
        import traceback
        traceback.print_exc(file=sys.stderr)
        emit(id,error=str(error))
    finally:cancelled.pop(id,None)
if __name__=='__main__':
    # Native DLL initialization must finish on the main thread on Windows.
    if os.environ.get('OPENCLAUDE_ENGINE')=='llama.cpp':import llama_cpp
    elif os.environ.get('OPENCLAUDE_ENGINE')=='mlx':import mlx_lm
    for line in sys.stdin:
        try:
            message=json.loads(line)
            if message['action']=='cancel':
                event=cancelled.get(message['args']['requestId'])
                if event:event.set()
            else:
                cancelled[message['id']]=threading.Event();threading.Thread(target=handle,args=(message,),daemon=True).start()
        except Exception as error:emit('protocol',error=str(error))
