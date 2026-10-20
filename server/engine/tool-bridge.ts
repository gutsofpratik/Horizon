import {createServer,type Server,type IncomingMessage,type ServerResponse} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import type {ToolContext,ToolRegistry} from '../tools/registry.ts';
import {directToolCatalog} from '../tools/model-interface.ts';
import {ToolCircuitBreaker,callFingerprint} from '../agent/tool-circuit-breaker.ts';
import {serializeToolResult} from '../agent/tool-result.ts';
import {isToolGroup} from '../tools/groups.ts';

interface Binding {token:string;context:ToolContext;active:boolean;circuit:ToolCircuitBreaker;requests:Map<string,{fingerprint:string;response?:Promise<any>}>;dispose:()=>void}
type RequestId=string|number|null;
/** Private, run-scoped MCP transport. No caller can supply or override ToolContext. */
export class EngineToolBridge {
 private server?:Server;
 private starting?:Promise<void>;
 private origin='';
 private closed=false;
 private bindings=new Map<string,Binding>();
 constructor(private registry:ToolRegistry){}
 private async start(){
  if(this.closed)throw new Error('Engine tool bridge is closed');
  if(this.server)return;
  if(this.starting)return this.starting;
  this.starting=new Promise<void>((resolve,reject)=>{
   const server=createServer((request,response)=>{this.handle(request,response).catch(()=>{if(!response.headersSent)this.json(response,500,{error:'Tool bridge request failed'});else response.end();});});
   server.requestTimeout=30000;server.headersTimeout=10000;
   server.once('error',reject);
   server.listen(0,'127.0.0.1',()=>{const address=server.address();if(!address||typeof address==='string'){server.close();reject(new Error('Cannot allocate private tool bridge'));return;}if(this.closed){server.close();reject(new Error('Engine tool bridge is closed'));return;}this.origin='http://127.0.0.1:'+address.port;this.server=server;resolve();});
  }).finally(()=>{this.starting=undefined;});
  return this.starting;
 }
 async bind(context:ToolContext){
  if(context.signal.aborted)throw new Error('Cannot bind tools to a cancelled run');
  if(!context.runId||!context.conversationId)throw new Error('Tool bridge requires a host-owned conversation and run');
  await this.start();
  if(context.signal.aborted||this.closed)throw new Error('Tool binding cancelled');
  const token=randomBytes(32).toString('hex');let disposed=false;
  const suspend=()=>{binding.active=false;binding.context.signal.removeEventListener('abort',suspend);};
  const dispose=()=>{disposed=true;suspend();this.bindings.delete(token);};
  const binding:Binding={token,context,active:true,circuit:new ToolCircuitBreaker(),requests:new Map(),dispose};
  const activate=(next:ToolContext)=>{
   if(disposed||this.closed||next.signal.aborted)throw new Error('Tool binding is no longer available');
   if(next.app!==context.app||next.conversationId!==context.conversationId||!next.runId)throw new Error('A tool binding cannot be transferred to another host or conversation');
   if(binding.active&&next.runId!==binding.context.runId)throw new Error('Suspend the previous engine turn before activating another');
   if(next.runId!==binding.context.runId&&[...binding.requests.values()].some(request=>request.response))throw new Error('A previous host tool is still running. Resolve or cancel it before starting another turn.');
   binding.context.signal.removeEventListener('abort',suspend);
   if(next.runId!==binding.context.runId){binding.circuit=new ToolCircuitBreaker();binding.requests.clear();}
   binding.context=next;binding.active=true;next.signal.addEventListener('abort',suspend,{once:true});
  };
  this.bindings.set(token,binding);context.signal.addEventListener('abort',suspend,{once:true});
  return {server:{id:'openclaude-tools',name:'OpenClaude tools',transport:{type:'streamable_http',url:this.origin+'/mcp',headers:{Authorization:'Bearer '+token}}},activate,suspend,dispose};
 }
 private json(response:ServerResponse,status:number,body:unknown){response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(JSON.stringify(body));}
 private error(response:ServerResponse,id:RequestId,code:number,message:string){this.json(response,200,{jsonrpc:'2.0',id,error:{code,message}});}
 private outcome(outcome:any,binding:Binding,recovery?:{message?:string}){
  const content:any[]=[{type:'text',text:serializeToolResult({...outcome,...(recovery?.message?{recovery}:{})})}];
  const image=outcome.data?.screenshot?.image;
  if(binding.context.vision&&typeof image==='string'){
   const data=image.replace(/^data:image\/[^;]+;base64,/, '');
   if(/^[A-Za-z0-9+/\r\n]*={0,2}$/.test(data))content.push({type:'image',data,mimeType:data.startsWith('iVBOR')?'image/png':data.startsWith('UklGR')?'image/webp':'image/jpeg'});
  }
  return {isError:outcome.status!=='succeeded',content};
 }
 private authenticate(request:IncomingMessage){
  if(request.headers.origin||request.url!=='/mcp'||!['127.0.0.1','::ffff:127.0.0.1'].includes(request.socket.remoteAddress??''))return;
  const supplied=request.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!supplied)return;
  const binding=this.bindings.get(supplied);if(!binding||!binding.active||binding.context.signal.aborted)return;
  return timingSafeEqual(Buffer.from(supplied),Buffer.from(binding.token))?binding:undefined;
 }
 private async handle(request:IncomingMessage,response:ServerResponse){
  const binding=this.authenticate(request);if(!binding){this.json(response,401,{error:'A live run-scoped credential is required'});return;}
  if(request.method!=='POST'){response.writeHead(405,{Allow:'POST'});response.end();return;}
  if(!String(request.headers['content-type']??'').toLowerCase().startsWith('application/json')){this.json(response,415,{error:'Expected application/json'});return;}
  const chunks:Buffer[]=[];let size=0;
  for await(const chunk of request){size+=chunk.length;if(size>1024*1024){this.json(response,413,{error:'Tool request exceeds 1 MiB'});return;}chunks.push(Buffer.from(chunk));}
  let call:any;try{call=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{this.error(response,null,-32700,'Expected one complete JSON object');return;}
  const validId=call?.id===null||typeof call?.id==='string'&&call.id.length<=256||typeof call?.id==='number'&&Number.isSafeInteger(call.id);
  if(!call||Array.isArray(call)||call.jsonrpc!=='2.0'||typeof call.method!=='string'||Object.hasOwn(call,'id')&&!validId){this.error(response,null,-32600,'Invalid JSON-RPC request');return;}
  if(!Object.hasOwn(call,'id')){response.writeHead(202);response.end();return;}
  const result=(value:unknown)=>this.json(response,200,{jsonrpc:'2.0',id:call.id,result:value});
  if(call.method==='initialize'){result({protocolVersion:'2025-03-26',capabilities:{tools:{listChanged:false}},serverInfo:{name:'OpenClaude tools',version:'1.0.0'},instructions:'Call the exact offered function with object arguments. Host permissions and approval buttons remain authoritative. Failed calls include correction guidance; do not replay completed actions.'});return;}
  if(call.method==='ping'){result({});return;}
  if(call.method==='tools/list'){result({tools:directToolCatalog(this.registry,binding.context).map(item=>({name:item.function.name,description:item.function.description,inputSchema:item.function.parameters}))});return;}
  if(call.method!=='tools/call'){this.error(response,call.id,-32601,'Unsupported MCP method');return;}
  const params=call.params;if(!params||Array.isArray(params)||typeof params.name!=='string'||params.name.length>200||params.arguments!==undefined&&(!params.arguments||typeof params.arguments!=='object'||Array.isArray(params.arguments))){this.error(response,call.id,-32602,'tools/call requires name and arguments as one object');return;}
  // An MCP request ID is stable across a transport retry. The registry owns idempotency
  // and refuses to replay a write whose earlier execution outcome is unknown.
  const operation={id:'engine:'+typeof call.id+':'+String(call.id),name:params.name,arguments:params.arguments??{}};
  const fingerprint=callFingerprint(operation),previous=binding.requests.get(operation.id);
  if(previous&&previous.fingerprint!==fingerprint){this.error(response,call.id,-32602,'This request ID already belongs to another operation. Use a new ID for a different call.');return;}
  if(previous){result(previous.response?await previous.response:this.outcome(await this.registry.execute(operation,binding.context),binding));return;}
  if(binding.requests.size>=2000){this.error(response,call.id,-32000,'Run tool-call budget reached; continue in a new run.');return;}
  const execute=async()=>{
   const retired=operation.name==='toolkit'||isToolGroup(operation.name)?{code:'DIRECT_TOOL_REQUIRED',message:'The adopted backend calls concrete functions directly. Use the exact function schema returned by discover_tools; do not wrap it in a toolkit/category envelope.'}:undefined;
   const outcome=await this.registry.execute({...operation,blockedError:retired??binding.circuit.beforeCall(operation)},binding.context);
   binding.circuit.observe(operation,outcome);const recovery=binding.circuit.finishRound();
   return this.outcome(outcome,binding,recovery);
  };
  const pending=execute();const saved={fingerprint,response:pending as Promise<any>|undefined};binding.requests.set(operation.id,saved);try{result(await pending);}finally{saved.response=undefined;}
 }
 async close(){this.closed=true;for(const binding of [...this.bindings.values()])binding.dispose();await this.starting?.catch(()=>{});const server=this.server;this.server=undefined;if(server){server.closeIdleConnections();await new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();});}}
}
