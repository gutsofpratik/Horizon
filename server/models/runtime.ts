import {startInferenceHeartbeat} from './heartbeat.ts';
import {workerExecutable} from './process.ts';
import {EngineEnvironment,engineFor,validateModelSettings} from './engines.ts';
import {modelDownloadPlan} from './download-plan.ts';
import {spawn,execFile,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';import {randomUUID} from 'node:crypto';import {join,resolve,basename} from 'node:path';import {stat} from 'node:fs/promises';
import type {AppContext} from '../app.ts';
import {listOllamaModels,importOllamaModel} from './ollama-import.ts';
import {ModelBalancer} from './balancer.ts';
import {modelDefaults,checkLoadingGuardrail,applyRuntimeDefault,runtimeConfiguration} from './defaults.ts';
import {runtimePacks} from './packs.ts';
export class ModelRuntime {
 private worker?:ChildProcessWithoutNullStreams;private pending=new Map<string,{resolve:(value:any)=>void;reject:(error:Error)=>void;event?:(event:any)=>void;cleanup:()=>void}>();
 loaded:any=null;status='idle';error='';private stderr='';
 private selection:Promise<any>=Promise.resolve();private selectedSignature='';private generations=0;private closed=false;
 private balancer=new ModelBalancer({ready:entry=>this.isReady(entry),capacity:()=>this.loaded?.parallelPredictions??1,activate:entry=>this.activate(entry)});
 get balance(){return this.balancer.snapshot();}
 private signature(entry:any){return JSON.stringify([entry.id,entry.path,runtimeConfiguration(entry.path,entry.configuration,modelDefaults(this.defaults())),entry.ollama?.system]);}
 isReady(entry:any){return !!entry&&this.loaded?.modelId===entry.id&&this.selectedSignature===this.signature(entry);}
 private schedule(task:()=>Promise<any>){const operation=this.selection.catch(()=>{}).then(task);this.selection=operation;return operation;}
 private async activate(entry:any){const signature=this.signature(entry);if(this.isReady(entry))return this.loaded;if(this.generations||this.loading)throw new Error('Wait for the current model operation to finish before switching models');if(this.loaded)await this.unload();const loaded=await this.load(entry);this.selectedSignature=signature;return loaded;}
 select(entry:any){if(this.isReady(entry))return Promise.resolve(this.loaded);return this.balancer.run(entry,async()=>this.loaded);}
 generateFor(entry:any,args:any,event?:(event:any)=>void,signal?:AbortSignal){return this.balancer.run(entry,()=>this.dispatch('generate',args,event,signal),signal,()=>event?.({event:'chunk',data:{openclaude_phase:'queued'}}));}
 measureFor(entry:any,args:any,signal?:AbortSignal){return this.balancer.run(entry,()=>this.dispatch('measure',args,undefined,signal),signal);}
 private workerFile='worker.py';private engine='transformers';private runtimeVariant='stock';private python=process.env.OPENCLAUDE_PYTHON??'python';private loading=false;readonly environment:EngineEnvironment;
 constructor(private root:string,workerFile='worker.py',private defaults:()=>any=()=>({})){this.workerFile=workerFile;this.environment=new EngineEnvironment(root);}
 private start(){if(this.worker)return;const child=spawn(workerExecutable(this.python),['-u',join(this.root,'runtime/models',this.workerFile)],{stdio:'pipe',windowsHide:true,env:{...process.env,PYTHONUNBUFFERED:'1',OPENCLAUDE_ENGINE:this.engine,OPENCLAUDE_LLAMA_VARIANT:this.runtimeVariant}});this.worker=child;
  createInterface({input:child.stdout}).on('line',line=>{try{const message=JSON.parse(line);const pending=this.pending.get(message.id);if(!pending)return;if(message.event){pending.event?.(message);return;}this.pending.delete(message.id);pending.cleanup();message.error?pending.reject(new Error(message.error)):pending.resolve(message.result);}catch(error){this.error='Invalid response from model worker';}});
  child.stderr.on('data',data=>{this.stderr=(this.stderr+data.toString()).slice(-5000);});
  const failed=(error:Error)=>{if(this.worker!==child)return;this.worker=undefined;this.loaded=null;this.status='unavailable';this.error=error.message;for(const pending of this.pending.values()){pending.cleanup();pending.reject(error);}this.pending.clear();};
  child.on('error',failed);child.on('exit',code=>failed(new Error('Model worker exited ('+code+'): '+this.stderr.slice(-1500))));
 }
 call(action:string,args:any={},event?:(event:any)=>void,signal?:AbortSignal):Promise<any>{if(action==='download')return this.schedule(async()=>{this.python=await this.environment.ensure('download','cpu');if(this.closed)throw new Error('Model runtime closed');return this.dispatch(action,args,event,signal);});if(action==='generate')return this.schedule(()=>{if(signal?.aborted)throw new Error('Generation cancelled');return this.dispatch(action,args,event,signal);});return this.dispatch(action,args,event,signal);}
 private dispatch(action:string,args:any={},event?:(event:any)=>void,signal?:AbortSignal){this.start();if(action==='generate')this.generations++;const id=randomUUID();return new Promise<any>((resolve,reject)=>{
  const cancel=()=>{if(action==='load'){this.dispose();this.status='idle';return;}this.worker?.stdin.write(JSON.stringify({id:randomUUID(),action:'cancel',args:{requestId:id}})+'\n');};
  const timeout=setTimeout(()=>{this.pending.delete(id);cleanup();cancel();reject(new Error('Model operation timed out'));},action==='inspect_runtime'?60000:1800000);timeout.unref();
  let cleaned=false;const cleanup=()=>{if(cleaned)return;cleaned=true;if(action==='generate')this.generations--;clearTimeout(timeout);signal?.removeEventListener('abort',cancel);};this.pending.set(id,{resolve,reject,event,cleanup});signal?.addEventListener('abort',cancel,{once:true});
  this.worker!.stdin.write(JSON.stringify({id,action,args})+'\n');if(signal?.aborted)cancel();
 });}
 async load(entry:any){
  if(this.closed)throw new Error('Model runtime closed');
  if(this.loading)throw new Error('A model is already loading');
  if(this.loaded)throw new Error('Unload the current model first');
  this.loading=true;this.status='loading';this.error='';
  try{
   const defaults=modelDefaults(this.defaults());
   const config=validateModelSettings(applyRuntimeDefault(entry.path,entry.configuration??{},defaults));const engine=engineFor(entry.path,config);
   await checkLoadingGuardrail(entry.path,defaults,config);
   const effective=runtimeConfiguration(entry.path,config,defaults);
   this.dispose();this.engine=engine;this.runtimeVariant=config.runtimeVariant??'stock';
   if(this.runtimeVariant==='prism'&&engine!=='llama.cpp')throw new Error('Prism requires a GGUF model and the llama.cpp engine');
   this.status='Preparing '+engine+' runtime';this.python=await this.environment.ensure(engine,config.device);this.workerFile=engine==='transformers'?'worker.py':'native_worker.py';
   if(this.closed)throw new Error('Model runtime closed');
   this.loaded=await this.call('load',{path:entry.path,configuration:effective,modelId:entry.id,engine,importedSystem:entry.ollama?.system,projectorLayers:entry.ollama?.layers},event=>{this.status=event.data.stage??'loading';});this.selectedSignature=this.signature(entry);this.status='loaded';return this.loaded;
  }catch(error){const details=this.stderr.slice(-1800);this.dispose();this.status='failed';this.error=(error as Error).message+(details?'\nNative runtime details:\n'+details:'');throw new Error(this.error);}
  finally{this.loading=false;}
 } async unload(){if(this.generations||this.loading)throw new Error('Stop the current response before releasing the model');if(this.loaded)await this.call('unload');this.loaded=null;this.selectedSignature='';this.status='idle';return {status:'unloaded'};}
 shutdown(){this.closed=true;this.balancer.close();this.dispose();}
 dispose(){const child=this.worker;this.worker=undefined;if(child){if(process.platform==='win32'&&child.pid)execFile('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true},()=>{child.kill();});else child.kill();}this.loaded=null;this.status='idle';for(const pending of this.pending.values()){pending.cleanup();pending.reject(new Error('Model runtime closed or loading cancelled'));}this.pending.clear();}
}
export function registerModelRuntime(app:any,context:AppContext){
 const runtime=new ModelRuntime(context.root,'worker.py',()=>context.store.get('settings','main')?.modelDefaults??{}),downloads=new ModelRuntime(context.root,'download_worker.py');context.ephemeral.set('modelRuntime',runtime);app.addHook('onClose',async()=>{runtime.shutdown();downloads.shutdown();});
 if(!context.store.get('providers','builtin'))context.store.put('providers',{id:'builtin',name:'OpenClaude built-in',type:'openai',baseUrl:'http://127.0.0.1:3001/api/builtin/v1'});
 app.get('/api/model-library',async()=>({models:context.store.list('local_models'),loaded:runtime.loaded,status:runtime.status,error:runtime.error,balance:runtime.balance}));
 app.get('/api/model-library/runtime-packs',async()=>({packs:runtimePacks(),setup:{status:runtime.environment.status,log:runtime.environment.log,error:runtime.environment.error}}));
 app.post('/api/model-library/runtime-packs/:id/install',async(request:any)=>{const id=String(request.params.id);const pack=runtimePacks().find(pack=>pack.id===id);if(!pack?.installable)throw new Error(pack?.description??'Unknown runtime pack');if(id==='office')return context.runtime?.startSetup();if(runtime.loaded||runtime.balance.active||runtime.balance.activating)throw new Error('Restart the app before replacing an inference runtime; a model is currently loaded or loading.');await runtime.environment.ensure('llama.cpp',id==='llama-cuda'?'cuda':'cpu');return {status:runtime.environment.status};});
 app.get('/api/model-library/ollama',async()=>({models:await listOllamaModels()}));
 app.post('/api/model-library/ollama/import',async(request:any)=>importOllamaModel(context,String(request.body.id??'')));
 app.post('/api/model-library/prepare',async(request:any)=>{const {providerId,model}=request.body;if(providerId!=='builtin')return runtime.unload();const entry=context.store.get('local_models',String(model));if(!entry)throw new Error('Model is not in the library');return runtime.select(entry);});
 app.post('/api/model-library/:id/select',async(request:any)=>{const entry=context.store.get('local_models',request.params.id);if(!entry)throw new Error('Model is not in the library');return runtime.select(entry);});
 app.get('/api/model-library/catalog',async(request:any)=>{const query=String(request.query.q??'').trim().slice(0,200);const url=new URL('https://huggingface.co/api/models');url.searchParams.set('pipeline_tag','text-generation');if(request.query.format==='gguf')url.searchParams.set('filter','gguf');if(request.query.format==='mlx')url.searchParams.set('filter','mlx');url.searchParams.set('limit','24');url.searchParams.set('sort','downloads');url.searchParams.set('direction','-1');if(query)url.searchParams.set('search',query);const response=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Model catalog returned '+response.status);const data=await response.json();return {models:data.map((model:any)=>({id:model.id,name:model.id.split('/').slice(1).join('/'),publisher:model.id.split('/')[0],downloads:model.downloads??0,likes:model.likes??0,url:'https://huggingface.co/'+model.id}))};});
 app.post('/api/model-library/:id/configuration',async(request:any)=>{const model=context.store.get('local_models',request.params.id);if(!model)throw new Error('Model is not in the library');const configuration=validateModelSettings(request.body.configuration);return context.store.put('local_models',{...model,configuration});});
 app.get('/api/model-library/runtime',async()=>({transport:'private-stdio',platform:process.platform,arch:process.arch,engines:[{id:'llama.cpp',supported:true},{id:'mlx',supported:process.platform==='darwin'&&process.arch==='arm64'},{id:'transformers',supported:true}],setup:{status:runtime.environment.status,error:runtime.environment.error,log:runtime.environment.log}}));
 app.post('/api/model-library/import',async(request:any)=>{const path=resolve(String(request.body.path??''));const info=await stat(path);if(!info.isDirectory()&&!(info.isFile()&&path.toLowerCase().endsWith('.gguf')))throw new Error('Choose a GGUF file or safetensors directory');const configuration=request.body.configuration;if(!configuration||typeof configuration!=='object'||Array.isArray(configuration))throw new Error('Supply the model JSON configuration');return context.store.put('local_models',{id:randomUUID(),name:request.body.name??basename(path),path,configuration});});
 app.post('/api/model-library/:id/load',async(request:any)=>{const entry=context.store.get('local_models',request.params.id);if(!entry)throw new Error('Model is not in the library');return runtime.select(entry);});
 app.post('/api/model-library/unload',async()=>runtime.unload());
 app.delete('/api/model-library/:id',async(request:any)=>{if(runtime.loaded?.modelId===request.params.id){if(runtime.balance.active||runtime.balance.activating)throw new Error('Stop the current response before removing this model');await runtime.unload();}context.store.delete('local_models',request.params.id);return {removed:true};});
 app.get('/api/model-library/source',async(request:any)=>{const repo=String(request.query.repo??'');if(!/^[\w.-]+\/[\w.-]+$/.test(repo))throw new Error('Use a Hugging Face publisher/model repository ID');const response=await fetch('https://huggingface.co/api/models/'+repo+'?blobs=true',{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Source repository returned '+response.status);const data=await response.json();const files=(data.siblings??[]).filter((file:any)=>/\.(json|safetensors|gguf|model|txt|tiktoken|jinja)$/i.test(file.rfilename)).map((file:any)=>({name:file.rfilename,size:file.size,sha256:file.lfs?.sha256}));const plan=await modelDownloadPlan(files,async()=>{const index=await fetch('https://huggingface.co/'+repo+'/resolve/'+data.sha+'/model.safetensors.index.json',{signal:AbortSignal.timeout(15000)});if(!index.ok)throw new Error('Cannot read model shard index');return index.json();});return {repo,revision:data.sha,license:data.cardData?.license,engine:data.library_name==='mlx'||data.tags?.includes('mlx')?'mlx':'auto',files,...plan};});
 app.post('/api/model-library/download',async(request:any)=>{const {repo,revision,files,configuration,projector}=request.body;if(projector&&(!Array.isArray(files)||!files.includes(projector)||typeof projector!=='string'||!projector.endsWith('.gguf')))throw new Error('Select a projector included in this download');if(!/^[\w.-]+\/[\w.-]+$/.test(repo)||!/^[a-f0-9]{40}$/.test(revision)||!Array.isArray(files)||!files.length||files.length>1000)throw new Error('Select files from a pinned source repository');const directory=join(context.dataDirectory,'models',repo.replace('/','--'),revision);const id=randomUUID();const download:any={id,status:'downloading',repo,revision,progress:null};context.ephemeral.set('modelDownload:'+id,download);void downloads.call('download',{repo,revision,files,directory},event=>{download.progress=event.data;}).then(result=>{const gguf=files.find((file:string)=>file.endsWith('.gguf')&&file!==projector);const entry=context.store.put('local_models',{id:randomUUID(),name:repo+(gguf?' · '+basename(gguf):''),path:gguf?join(result.path,gguf):result.path,configuration:{...(configuration??{}),...(projector?{visionProjectorPath:join(result.path,projector)}:{})},source:{repo,revision}});download.status='completed';download.model=entry;}).catch(error=>{download.status='failed';download.error=error.message;});return download;});
 app.get('/api/model-library/downloads/:id',async(request:any)=>{const job=context.ephemeral.get('modelDownload:'+request.params.id);if(!job)throw new Error('Download not found');return job;});
 app.get('/api/builtin/v1/models',async()=>({data:context.store.list('local_models').map((entry:any)=>({id:entry.id,name:entry.name,loaded:runtime.loaded?.modelId===entry.id,capabilities:runtime.loaded?.modelId===entry.id?runtime.loaded.capabilities:entry.configuration?.capabilities??[],reasoningMode:runtime.loaded?.modelId===entry.id?runtime.loaded.reasoningMode:undefined,runtimeInfo:runtime.loaded?.modelId===entry.id?{device:runtime.loaded.device,contextTokens:runtime.loaded.configuration.contextTokens,cacheType:runtime.loaded.cacheType,parallelPredictions:runtime.loaded.parallelPredictions,batching:runtime.loaded.batching}:undefined,local:true}))}));
 app.get('/api/builtin/configuration',async(request:any)=>{const id=request.query.model;const entry=id?context.store.get('local_models',String(id)):undefined;if(id&&!entry)throw new Error('Model is not in the library');const loaded=!id||runtime.loaded?.modelId===id?runtime.loaded:null;const ready=!!loaded&&(!entry||runtime.isReady(entry));return {...(ready?loaded.configuration:entry?.configuration),requestedConfiguration:entry?.configuration,appliedConfiguration:loaded?.configuration,pending:!!loaded&&!ready,capabilities:loaded?.capabilities??entry?.configuration?.capabilities??[],reasoningMode:loaded?.reasoningMode,loaded:ready};});
 app.post('/api/builtin/v1/chat/completions',async(request:any,reply:any)=>{
  const body=request.body;const entry=context.store.get('local_models',body.model);if(!entry)throw new Error('Add a model in Settings → Models, then choose it in chat');
  const controller=new AbortController();reply.hijack();reply.raw.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});reply.raw.on('close',()=>{if(!reply.raw.writableEnded)controller.abort();});
  reply.raw.flushHeaders?.();const stopHeartbeat=startInferenceHeartbeat(reply.raw);
  const send=(data:any)=>{if(!reply.raw.destroyed)reply.raw.write('data: '+JSON.stringify(data)+'\n\n');};
  try{const result=await runtime.generateFor(entry,{model:body.model,messages:body.messages,tools:body.tools??[],json:!!body.response_format,maxTokens:body.max_tokens,thinking:!!body.thinking,autoCompact:body.auto_compact===true,toolChoice:body.tool_choice,toolProtocol:body.tool_protocol==='envelope'?'envelope':undefined,cacheScope:typeof body.cache_scope==='string'?body.cache_scope.slice(0,200):undefined},event=>send({choices:[{index:0,delta:event.data}]}),controller.signal);send({choices:[{index:0,delta:{},finish_reason:result.finish_reason}],usage:result.usage??{prompt_tokens:result.inputTokens}});reply.raw.write('data: [DONE]\n\n');}catch(error){send({error:{message:(error as Error).message}});}finally{stopHeartbeat();reply.raw.end();}
 });
}



