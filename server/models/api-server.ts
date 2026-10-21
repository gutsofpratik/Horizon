import {createServer,type Server} from 'node:http';
import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import type {ModelRuntime} from './runtime.ts';
import type {AppContext} from '../app.ts';

// Separate inference listener: never shares the application's host credential or routes.
export function registerInferenceApi(app:any,context:AppContext,runtime:ModelRuntime){
 let server:Server|undefined,port=1234;const requests=new Set<AbortController>();
 const digest=(key:string)=>createHash('sha256').update(key).digest();
 let keyHash:Buffer|undefined;
 const status=()=>({running:!!server?.listening,baseUrl:`http://127.0.0.1:${port}/v1`,port,hasKey:!!keyHash,loaded:runtime.loaded,status:runtime.status});
 const stop=async()=>{for(const request of requests)request.abort();if(server){const current=server;server=undefined;current.closeAllConnections();await new Promise<void>(resolve=>current.close(()=>resolve()));}};
 app.get('/api/inference-api',async()=>status());
 app.post('/api/inference-api/key',async()=>{const key='hzn_'+randomBytes(32).toString('hex');keyHash=digest(key);return {key,...status()};});
 app.delete('/api/inference-api/key',async()=>{keyHash=undefined;await stop();return status();});
 app.post('/api/inference-api/stop',async()=>{await stop();return status();});
 app.post('/api/inference-api/start',async(request:any)=>{
  const requested=request.body?.port??1234;if(!Number.isInteger(requested)||requested<1024||requested>65535)throw new Error('Port must be between 1024 and 65535');
  if(!keyHash)throw new Error('Create an API key before starting the endpoint');
  await stop();port=requested;
  const listener=createServer(async(req,res)=>{
   const json=(code:number,value:any)=>{if(res.headersSent)return;res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
   // Browsers cannot use this privileged listener cross-origin.
   if(req.headers.origin)return json(403,{error:{message:'Browser-origin requests are not accepted'}});
   const supplied=String(req.headers.authorization??'').replace(/^Bearer /,'');const hash=digest(supplied);
   if(!keyHash||!timingSafeEqual(hash,keyHash))return json(401,{error:{message:'Invalid API key'}});
   if(req.method==='GET'&&req.url==='/v1/models')return json(200,{object:'list',data:runtime.loaded?[{id:runtime.loaded.modelId,object:'model',owned_by:'horizon'}]:[]});
   if(req.method!=='POST'||req.url!=='/v1/chat/completions')return json(404,{error:{message:'Unknown inference endpoint'}});
   const controller=new AbortController();requests.add(controller);res.on('close',()=>{if(!res.writableEnded)controller.abort();});
   try{
    let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>2*1024*1024){json(413,{error:{message:'Request exceeds 2 MiB'}});return;}chunks.push(chunk);}
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!Array.isArray(body.messages)||!body.messages.length||body.messages.length>1000)throw new Error('messages must be a nonempty array with at most 1000 entries');
    if(body.stream!==undefined&&typeof body.stream!=='boolean')throw new Error('stream must be a boolean');
    if(body.max_tokens!==undefined&&(!Number.isInteger(body.max_tokens)||body.max_tokens<1))throw new Error('max_tokens must be a positive integer');
    const loaded=runtime.loaded;const entry=loaded&&context.store.get('local_models',loaded.modelId);
    if(!entry||!runtime.isReady(entry))return json(409,{error:{message:'Load a local model in Horizon first'}});
    if(body.model&&body.model!==entry.id&&body.model!==entry.name)return json(409,{error:{message:'Only the currently loaded model is available'}});
    const id='chatcmpl-'+randomUUID(),created=Math.floor(Date.now()/1000);let content='',reasoning='';const calls:any[]=[];
    const send=(value:any)=>{if(!res.destroyed)res.write('data: '+JSON.stringify(value)+'\n\n');};
    if(body.stream){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});res.flushHeaders();}
    const result=await runtime.generateFor(entry,{model:entry.id,messages:body.messages,tools:body.tools??[],maxTokens:body.max_tokens,thinking:body.thinking===true,toolChoice:body.tool_choice,cacheScope:'external-api'},event=>{
     if(event.event!=='chunk')return;const delta=event.data??{};if(typeof delta.content==='string')content+=delta.content;if(typeof delta.reasoning_content==='string')reasoning+=delta.reasoning_content;
     if(Array.isArray(delta.tool_calls))for(const call of delta.tool_calls){const index=call.index??0;const old=calls[index]??{id:call.id,type:'function',function:{name:'',arguments:''}};if(call.id)old.id=call.id;if(call.function?.name)old.function.name+=call.function.name;if(call.function?.arguments)old.function.arguments+=call.function.arguments;calls[index]=old;}
     if(body.stream)send({id,object:'chat.completion.chunk',created,model:entry.id,choices:[{index:0,delta,finish_reason:null}]});
    },controller.signal);
    const usage=result.usage??{prompt_tokens:result.inputTokens};const finish=result.finish_reason??'stop';
    if(body.stream){send({id,object:'chat.completion.chunk',created,model:entry.id,choices:[{index:0,delta:{},finish_reason:finish}],usage});res.end('data: [DONE]\n\n');}
    else json(200,{id,object:'chat.completion',created,model:entry.id,choices:[{index:0,message:{role:'assistant',content,...(reasoning?{reasoning_content:reasoning}:{}),...(calls.length?{tool_calls:calls.filter(Boolean)}:{})},finish_reason:finish}],usage});
   }catch(error){const message=(error as Error).message;if(res.headersSent){res.write('data: '+JSON.stringify({error:{message}})+'\n\n');res.end();}else json(400,{error:{message}});}finally{requests.delete(controller);}
  });
  await new Promise<void>((resolve,reject)=>{listener.once('error',reject);listener.listen(port,'127.0.0.1',()=>{listener.removeListener('error',reject);resolve();});});server=listener;return status();
 });
 app.addHook('onClose',stop);
}
