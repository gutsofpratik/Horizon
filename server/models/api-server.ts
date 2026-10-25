import {createServer,type Server} from 'node:http';
import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import type {ModelRuntime} from './runtime.ts';
import type {AppContext} from '../app.ts';
import {encryptProviderKey,resolveProvider} from '../providers/credentials.ts';
import {startInferenceHeartbeat} from './heartbeat.ts';
import {responseRequest,responseOutput} from './api-formats.ts';

// Separate inference listener: never shares the application's host credential or routes.
export function registerInferenceApi(app:any,context:AppContext,runtime:ModelRuntime){
 const saved:Record<string,any>=context.store.get('inference_api','main')??{};
 let server:Server|undefined,port=Number.isInteger(saved?.port)&&saved.port>=1024&&saved.port<=65535?saved.port:1234;const requests=new Set<AbortController>();
 const digest=(key:string)=>createHash('sha256').update(key).digest();
 type ApiKey={id:string;name:string;hash:string;secret?:string;createdAt?:string;revokedAt?:string;lastUsedAt?:string};
 const keys:ApiKey[]=Array.isArray(saved?.keys)?saved.keys.filter((item:any)=>typeof item.id==='string'&&/^[a-f0-9]{64}$/.test(item.hash)):[];
 if(!keys.length&&/^[a-f0-9]{64}$/.test(saved?.keyHash??''))keys.push({id:randomUUID(),name:'Existing API key',hash:saved.keyHash});
 const activeKeys=()=>keys.filter(item=>!item.revokedAt);
 let enabled=saved?.enabled===true,error:string|undefined;
 const persist=()=>context.store.put('inference_api',{id:'main',port,enabled,keys});
 const issueKey=(name='Local application')=>{if(activeKeys().length>=100)throw new Error('Revoke an unused key before creating more than 100 active keys');const key='hzn_'+randomBytes(32).toString('hex');keys.push({id:randomUUID(),name:name.trim().slice(0,80)||'Local application',hash:digest(key).toString('hex'),secret:encryptProviderKey(context,key),createdAt:new Date().toISOString()});persist();return key;};
 const status=()=>({running:!!server?.listening,enabled,error,baseUrl:`http://127.0.0.1:${port}/v1`,port,hasKey:activeKeys().length>0,keys:keys.map(({hash,secret,...item})=>({...item,canReveal:!!secret&&!item.revokedAt})),loaded:runtime.loaded?{...runtime.loaded,name:context.store.get('local_models',runtime.loaded.modelId)?.name??runtime.loaded.name??runtime.loaded.modelId}:null,status:runtime.status});
 const selectedModel=()=>{const loaded=runtime.loaded&&context.store.get('local_models',runtime.loaded.modelId);if(loaded)return loaded;const settings=context.store.get('settings','main');return settings?.providerId==='builtin'?context.store.get('local_models',settings.model):undefined;};
 const modelName=(entry:any)=>String(entry.name??entry.id).trim()||entry.id;
 const modelAliases=(entry:any)=>[entry.id,modelName(entry),modelName(entry).split(/[\s·]/)[0],...(Array.isArray(entry.apiAliases)?entry.apiAliases:[])].filter((value:any)=>typeof value==='string'&&value);
 const stop=async()=>{for(const request of requests)request.abort();if(server){const current=server;server=undefined;current.closeAllConnections();await new Promise<void>(resolve=>current.close(()=>resolve()));}};
 app.get('/api/inference-api',async()=>status());
 app.post('/api/inference-api/key',async(request:any)=>{const name=request.body?.name;if(name!==undefined&&typeof name!=='string')throw new Error('Key name must be text');const key=issueKey(name);return {key,...status()};});
 app.post('/api/inference-api/keys/:id/reveal',async(request:any,reply:any)=>{const item=keys.find(key=>key.id===request.params.id&&!key.revokedAt);if(!item?.secret)return reply.code(404).send({error:'This older key cannot be revealed. Create a new key to view its value.'});return reply.header('Cache-Control','no-store').send({key:resolveProvider(context,{apiKey:item.secret}).apiKey});});
 app.post('/api/inference-api/keys/:id/restore',async(request:any,reply:any)=>{
  const item=keys.find(key=>key.id===request.params.id&&!key.revokedAt),value=request.body?.key;
  if(!item||typeof value!=='string'||value.length>512||!timingSafeEqual(digest(value),Buffer.from(item.hash,'hex')))return reply.code(400).send({error:'Paste the original value of this key. It must match the saved key.'});
  item.secret=encryptProviderKey(context,value);persist();return reply.header('Cache-Control','no-store').send(status());
 });
 app.delete('/api/inference-api/keys/:id/record',async(request:any)=>{
  const index=keys.findIndex(key=>key.id===request.params.id);if(index<0)throw new Error('API key not found');
  keys.splice(index,1);if(!activeKeys().length){enabled=false;await stop();}persist();return status();
 });
 app.delete('/api/inference-api/keys/:id',async(request:any)=>{const item=keys.find(key=>key.id===request.params.id);if(!item)throw new Error('API key not found');item.revokedAt??=new Date().toISOString();delete item.secret;if(!activeKeys().length){enabled=false;await stop();}persist();return status();});
 app.delete('/api/inference-api/key',async()=>{enabled=false;for(const item of keys){item.revokedAt??=new Date().toISOString();delete item.secret;}persist();await stop();return status();});
 app.post('/api/inference-api/stop',async()=>{enabled=false;error=undefined;persist();await stop();return status();});
 const start=async(requested:number)=>{
  if(!Number.isInteger(requested)||requested<1024||requested>65535)throw new Error('Port must be between 1024 and 65535');
  if(!activeKeys().length)throw new Error('Create an API key before starting the endpoint');
  if(server?.listening&&port===requested)return status();
  await stop();port=requested;
  const listener=createServer(async(req,res)=>{
   const json=(code:number,value:any)=>{if(res.headersSent)return;res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
   // Browsers cannot use this privileged listener cross-origin.
   if(req.headers.origin)return json(403,{error:{message:'Browser-origin requests are not accepted'}});
   const supplied=String(req.headers.authorization??'').replace(/^Bearer /,'');const hash=digest(supplied);
   const accepted=activeKeys().find(item=>timingSafeEqual(hash,Buffer.from(item.hash,'hex')));
   if(!accepted)return json(401,{error:{message:'Invalid API key'}});
   if(!accepted.lastUsedAt||Date.now()-Date.parse(accepted.lastUsedAt)>60000){accepted.lastUsedAt=new Date().toISOString();persist();}
   const requestPath=req.url?.split('?')[0].replace(/\/$/,'');
   if(req.method==='GET'&&(requestPath==='/v1/models'||requestPath?.startsWith('/v1/models/'))){
    const loaded=runtime.loaded,entry=selectedModel();
    const name=entry?modelName(entry):undefined;
    if(requestPath!=='/v1/models'){
     let requested:string;try{requested=decodeURIComponent(requestPath!.slice('/v1/models/'.length));}catch{return json(400,{error:{message:'Invalid model name'}});}
     if(!entry||!modelAliases(entry).some(alias=>alias.toLowerCase()===requested.toLowerCase()))return json(404,{error:{message:'Model not found'}});
    }
    const data=entry?[{
     id:name,name,display_name:name,aliases:modelAliases(entry),object:'model',owned_by:'horizon',loaded:loaded?.modelId===entry.id,
     context_length:loaded?.configuration?.contextTokens??entry.configuration?.contextTokens??null,
     capabilities:loaded?.capabilities??entry.configuration?.capabilities??[],reasoning_mode:loaded?.reasoningMode??null,
     runtime:{device:loaded?.device??entry.configuration?.device??null,engine:loaded?.engine??entry.configuration?.engine??null},
    }]:[];return json(200,requestPath==='/v1/models'?{object:'list',data}:data[0]);
   }
   const route=req.url?.split('?')[0].replace(/\/$/,'');
   const responses=route==='/v1/responses',completion=route==='/v1/completions';
   if(req.method!=='POST'||!['/v1/chat/completions','/v1/responses','/v1/completions'].includes(route??''))return json(404,{error:{message:'This endpoint or model operation is not supported',code:'unsupported_endpoint'}});
   const controller=new AbortController();requests.add(controller);res.on('close',()=>{if(!res.writableEnded)controller.abort();});
   try{
    let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>2*1024*1024){json(413,{error:{message:'Request exceeds 2 MiB'}});return;}chunks.push(chunk);}
    let body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(responses)body=responseRequest(body);
    if(completion){if(typeof body.prompt!=='string')throw new Error('prompt must be a string');body={...body,messages:[{role:'user',content:body.prompt}]};}
    if(!Array.isArray(body.messages)||!body.messages.length||body.messages.length>1000)throw new Error('messages must be a nonempty array with at most 1000 entries');
    if(body.stream!==undefined&&typeof body.stream!=='boolean')throw new Error('stream must be a boolean');
    if(body.max_tokens!==undefined&&(!Number.isInteger(body.max_tokens)||body.max_tokens<1))throw new Error('max_tokens must be a positive integer');
    const entry=selectedModel();
    if(!entry)return json(409,{error:{message:'Select a local model in Horizon first. API requests load that selection automatically.',code:'model_not_selected'}});
    if(body.model!==undefined&&(typeof body.model!=='string'||!modelAliases(entry).some(alias=>alias.toLowerCase()===body.model.toLowerCase())))return json(409,{error:{message:'This endpoint uses '+modelName(entry)+'. Choose a model name or alias from GET /v1/models.',code:'model_mismatch'}});
    const responseModel=body.model||modelName(entry);
    const id=(responses?'resp_':completion?'cmpl-':'chatcmpl-')+randomUUID(),created=Math.floor(Date.now()/1000);let content='',reasoning='',responseMessageStarted=false;const calls:any[]=[];
    const send=(value:any)=>{if(!res.destroyed)res.write('data: '+JSON.stringify(value)+'\n\n');};
    let sequence=0;
    const sendResponse=(type:string,value:any)=>{if(!res.destroyed)res.write('event: '+type+'\ndata: '+JSON.stringify({type,sequence_number:sequence++,...value})+'\n\n');};
    if(body.stream){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});res.flushHeaders();}
    if(body.stream&&responses)sendResponse('response.created',{response:responseOutput(id,responseModel,created,'',[],null,'in_progress')});
    const stopHeartbeat=body.stream?startInferenceHeartbeat(res):()=>{};
    let result:any;try{result=await runtime.generateFor(entry,{model:entry.id,messages:body.messages,tools:body.tools??[],maxTokens:body.max_tokens??body.max_completion_tokens,temperature:body.temperature,thinking:body.thinking===true,toolChoice:body.tool_choice,cacheScope:'external-api'},event=>{
     if(event.event!=='chunk')return;const delta=event.data??{};if(typeof delta.content==='string')content+=delta.content;if(typeof delta.reasoning_content==='string')reasoning+=delta.reasoning_content;
     if(Array.isArray(delta.tool_calls))for(const call of delta.tool_calls){const index=call.index??0;const old=calls[index]??{id:call.id,type:'function',function:{name:'',arguments:''}};if(call.id)old.id=call.id;if(call.function?.name)old.function.name+=call.function.name;if(call.function?.arguments)old.function.arguments+=call.function.arguments;calls[index]=old;}
     if(body.stream){
      if(responses&&delta.content){
       if(!responseMessageStarted){responseMessageStarted=true;sendResponse('response.output_item.added',{output_index:0,item:{id:id+'_message',type:'message',status:'in_progress',role:'assistant',content:[]}});sendResponse('response.content_part.added',{item_id:id+'_message',output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}});}
       sendResponse('response.output_text.delta',{item_id:id+'_message',output_index:0,content_index:0,delta:delta.content});
      }else if(completion&&delta.content)send({id,object:'text_completion',created,model:responseModel,choices:[{index:0,text:delta.content,logprobs:null,finish_reason:null}]});
      else if(!responses&&!completion)send({id,object:'chat.completion.chunk',created,model:responseModel,choices:[{index:0,delta,finish_reason:null}]});
     }
    },controller.signal);}finally{stopHeartbeat();}
    const usage=result.usage??{prompt_tokens:result.inputTokens};const finish=result.finish_reason??'stop';
    if(responses){
     const response=responseOutput(id,responseModel,created,content,calls,usage,finish==='length'?'incomplete':'completed');
     if(finish==='length')(response as any).incomplete_details={reason:'max_output_tokens'};
     if(body.stream){
      if(responseMessageStarted){sendResponse('response.output_text.done',{item_id:id+'_message',output_index:0,content_index:0,text:content});sendResponse('response.content_part.done',{item_id:id+'_message',output_index:0,content_index:0,part:{type:'output_text',text:content,annotations:[]}});}
      for(const [index,item] of response.output.entries())sendResponse('response.output_item.done',{output_index:index,item});
      sendResponse(response.status==='incomplete'?'response.incomplete':'response.completed',{response});res.end();
     }else json(200,response);return;
    }
    if(completion){const value={id,object:'text_completion',created,model:responseModel,choices:[{index:0,text:body.stream?'':content,logprobs:null,finish_reason:finish}],usage};if(body.stream){send(value);res.end('data: [DONE]\n\n');}else json(200,value);return;}
    if(body.stream){send({id,object:'chat.completion.chunk',created,model:responseModel,choices:[{index:0,delta:{},finish_reason:finish}],usage});res.end('data: [DONE]\n\n');}
    else json(200,{id,object:'chat.completion',created,model:responseModel,choices:[{index:0,message:{role:'assistant',content,...(reasoning?{reasoning_content:reasoning}:{}),...(calls.length?{tool_calls:calls.filter(Boolean)}:{})},finish_reason:finish}],usage});
   }catch(error){const message=(error as Error).message;if(res.headersSent){res.write('data: '+JSON.stringify({error:{message}})+'\n\n');res.end();}else json(400,{error:{message}});}finally{requests.delete(controller);}
  });
  await new Promise<void>((resolve,reject)=>{listener.once('error',reject);listener.listen(port,'127.0.0.1',()=>{listener.removeListener('error',reject);resolve();});});server=listener;error=undefined;enabled=true;persist();return status();
 };
 app.post('/api/inference-api/start',async(request:any)=>{
  const requested=request.body?.port??port;
  if(!Number.isInteger(requested)||requested<1024||requested>65535)throw new Error('Port must be between 1024 and 65535');
  const key=activeKeys().length?undefined:issueKey();
  try{return {...await start(requested),...(key?{key}:{})};}catch(failure){error=(failure as Error).message;throw failure;}
 });
 app.addHook('onReady',async()=>{if(enabled&&activeKeys().length)try{await start(port);}catch(failure){error=(failure as Error).message;}});
 app.addHook('onClose',stop);
}
