import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {OAuthClientProvider} from '@modelcontextprotocol/sdk/client/auth.js';
import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import Ajv2019 from 'ajv/dist/2019.js';
import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {AppContext} from '../app.ts';
import {ToolError,type ToolRegistry} from '../tools/registry.ts';

type Session={client?:Client;status:string;error?:string;authorizationUrl?:string;toolCount?:number};
export class ConnectorManager {
 private sessions=new Map<string,Session>();
 private pending=new Map<string,Promise<any>>();
 private states=new Map<string,{id:string;expires:number}>();
 private ajv=new Ajv({strict:false,allErrors:true,validateFormats:false});
 private ajv2020=new Ajv2020({strict:false,allErrors:true,validateFormats:false});
 private ajv2019=new Ajv2019({strict:false,allErrors:true,validateFormats:false});
 constructor(private app:AppContext,private tools:ToolRegistry){}
 private secret(id:string){return this.app.store.get('connector_credentials',id)??{id};}
 private persist(id:string,patch:any){this.app.store.put('connector_credentials',{...this.secret(id),...patch,id});}
 list(){return this.app.store.list('mcp').map(item=>({id:item.id,name:item.name,url:item.url,type:'http',authMode:item.authMode??(item.apiKey?'bearer':'oauth'),clientId:this.secret(item.id).client?.client_id??'',hasApiKey:!!(this.secret(item.id).apiKey??item.apiKey),...this.view(item.id)}));}
 view(id:string){const session=this.sessions.get(id);return {status:session?.status??'disconnected',error:session?.error,authorizationUrl:session?.authorizationUrl,toolCount:session?.toolCount??0};}
 async save(body:any){
  const parsed=new URL(String(body.url));
  if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error('Enter an HTTP or HTTPS MCP URL without embedded credentials');
  const name=String(body.name??'').trim();if(!name)throw new Error('Enter a connector name');
  const id=String(body.id??randomUUID()),old=this.app.store.get('mcp',id);
  const mode=['oauth','bearer','none'].includes(body.authMode)?body.authMode:'oauth';
  const changed=old&&(old.url!==parsed.href||(old.authMode??'oauth')!==mode||body.clientId!==undefined&&body.clientId!==(this.secret(id).client?.client_id??''));
  await this.disconnect(id,false);
  if(changed)this.app.store.delete('connector_credentials',id);
  if(body.apiKey!==undefined)this.persist(id,{apiKey:String(body.apiKey)});
  else if(old?.apiKey&&old.url===parsed.href&&mode==='bearer')this.persist(id,{apiKey:old.apiKey});
  if(body.clientId)this.persist(id,{client:{...this.secret(id).client,client_id:String(body.clientId),...(body.clientSecret?{client_secret:String(body.clientSecret)}:{})}});
  this.app.store.put('mcp',{id,name,url:parsed.href,type:'http',authMode:mode});
  return this.list().find(item=>item.id===id);
 }
 private clearStates(id:string){for(const [state,value] of this.states)if(value.id===id)this.states.delete(state);}
 private unregister(id:string){const prefix=this.prefix(id);for(const name of this.tools.tools.keys())if(name.startsWith(prefix))this.tools.tools.delete(name);}
 private prefix(id:string){return 'connector_'+createHash('sha256').update(id).digest('hex').slice(0,10)+'_';}
 async disconnect(id:string,forget=true){
  if(this.pending.has(id))throw new Error('A connection is already in progress. Wait for it to finish.');
  const session=this.sessions.get(id);this.sessions.set(id,{status:'disconnected'});this.unregister(id);this.clearStates(id);
  if(session?.client)await session.client.close().catch(()=>{});
  this.persist(id,{enabled:false,...(forget?{tokens:undefined,verifier:undefined}:{} )});
 }
 async remove(id:string){await this.disconnect(id);this.app.store.delete('mcp',id);this.app.store.delete('connector_credentials',id);this.sessions.delete(id);}
 private provider(id:string,redirectUrl:string):OAuthClientProvider {
  return {
   redirectUrl,
   clientMetadata:{client_name:'OpenClaude',redirect_uris:[redirectUrl],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:this.secret(id).client?.client_secret?'client_secret_post':'none'},
   state:()=>{this.clearStates(id);const state=randomBytes(32).toString('hex');this.states.set(state,{id,expires:Date.now()+10*60_000});return state;},
   clientInformation:()=>this.secret(id).client,
   saveClientInformation:client=>this.persist(id,{client}),
   tokens:()=>this.secret(id).tokens,
   saveTokens:tokens=>this.persist(id,{tokens}),
   saveCodeVerifier:verifier=>this.persist(id,{verifier}),
   codeVerifier:()=>{const verifier=this.secret(id).verifier;if(!verifier)throw new Error('Authorization expired. Connect again.');return verifier;},
   redirectToAuthorization:url=>{const parsed=new URL(url);if(parsed.protocol!=='https:'&&!(parsed.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)))throw new Error('Authorization requires HTTPS');this.unregister(id);this.sessions.set(id,{...this.sessions.get(id),status:'authorization_required',authorizationUrl:url.href});},
   invalidateCredentials:scope=>{const patch:any={};if(scope==='all'||scope==='client')patch.client=undefined;if(scope==='all'||scope==='tokens')patch.tokens=undefined;if(scope==='all'||scope==='verifier')patch.verifier=undefined;if(scope==='all'||scope==='discovery')patch.discovery=undefined;this.persist(id,patch);},
   saveDiscoveryState:discovery=>this.persist(id,{discovery}),discoveryState:()=>this.secret(id).discovery
  };
 }
 connect(id:string,callback:string,code?:string):Promise<any>{
  if(this.pending.has(id))return this.pending.get(id)!;
  const operation=this.establish(id,callback,code).finally(()=>this.pending.delete(id));this.pending.set(id,operation);return operation;
 }
 private async establish(id:string,callback:string,code?:string){
  const item=this.app.store.get('mcp',id);if(!item)throw new Error('Connector not found');
  const previous=this.sessions.get(id);this.unregister(id);if(previous?.client)await previous.client.close().catch(()=>{});
  this.sessions.set(id,{status:'connecting'});
  let client:Client|undefined;
  try{
   const credentials=this.secret(id);const mode=item.authMode??(item.apiKey?'bearer':'oauth');
   const token=credentials.apiKey??item.apiKey;
   if(mode==='bearer'&&!token)throw new Error('Add an API key or bearer token in Edit connector before connecting.');
   const transport=new StreamableHTTPClientTransport(new URL(item.url),{
    ...(mode==='oauth'?{authProvider:this.provider(id,callback)}:{}),
    ...(mode==='bearer'&&token?{requestInit:{headers:{Authorization:'Bearer '+token}}}:{}),
    fetch:async(input,init)=>fetch(input,{...init,signal:AbortSignal.any([...(init?.signal?[init.signal]:[]),AbortSignal.timeout(120_000)])})
   });
   if(code)await transport.finishAuth(code);
   client=new Client({name:'OpenClaude',version:'0.1.0'},{capabilities:{}});
   await client.connect(transport,{timeout:30_000});
   const remote:any[]=[];let cursor:string|undefined;const cursors=new Set<string>();
   if(client.getServerCapabilities()?.tools)do{const page=await client.listTools(cursor?{cursor}:undefined,{timeout:30_000});remote.push(...page.tools);cursor=page.nextCursor;if(cursor&&cursors.has(cursor))throw new Error('Connector returned repeated tool pages');if(cursor)cursors.add(cursor);if(remote.length>256)throw new Error('Connector exposes too many tools (maximum 256)');}while(cursor);
   const connected=client;
   for(const tool of remote){
    const validator=/2020-12/.test(tool.inputSchema.$schema??'')?this.ajv2020:/2019-09/.test(tool.inputSchema.$schema??'')?this.ajv2019:this.ajv;
    const validate=validator.compile(tool.inputSchema);
    const name=this.prefix(id)+String(tool.name).replace(/[^a-zA-Z0-9_]/g,'_').slice(0,28)+'_'+createHash('sha256').update(tool.name).digest('hex').slice(0,6);
    this.tools.register({name,capability:'connector',description:`${item.name}: ${tool.description??tool.name}`.slice(0,2000),input:z.record(z.string(),z.unknown()),inputSchema:tool.inputSchema,
     available:()=>this.sessions.get(id)?.status==='connected'?null:'Connector is not connected. Connect it in Customize → Connectors.',
     handler:async(args,ctx)=>{if(!validate(args))throw new ToolError('INVALID_ARGUMENTS',validator.errorsText(validate.errors));try{const result:any=await connected.callTool({name:tool.name,arguments:args as Record<string,unknown>},undefined,{signal:ctx.signal,timeout:120_000});if(result.isError)throw new ToolError('CONNECTOR_TOOL_FAILED',result.content.filter((block:any)=>block.type==='text').map((block:any)=>block.text).join('\n')||'Connector tool failed');return {content:result.content,structuredContent:result.structuredContent,summary:`${item.name}: ${tool.name} completed`};}catch(error){if(this.sessions.get(id)?.status==='authorization_required')this.unregister(id);throw error;}}
    });
   }
   connected.onclose=()=>{if(this.sessions.get(id)?.client===connected){this.unregister(id);this.sessions.set(id,{status:'disconnected',error:'Connection closed. Reconnect to use its tools.'});}};
   this.sessions.set(id,{status:'connected',client:connected,toolCount:remote.length});this.persist(id,{enabled:true,callback,verifier:undefined});
  }catch(error){if(client)await client.close().catch(()=>{});this.unregister(id);if(this.sessions.get(id)?.status!=='authorization_required')this.sessions.set(id,{status:'error',error:String((error as Error).message).slice(0,600)});}
  return this.view(id);
 }
 async complete(state:string,code?:string,denied?:string){
  const pending=this.states.get(state);if(!pending||pending.expires<Date.now()){if(pending){this.states.delete(state);this.sessions.set(pending.id,{status:'error',error:'Authorization expired. Connect again.'});}throw new Error('Invalid or expired authorization. Connect again.');}
  this.states.delete(state);
  if(denied||!code){this.persist(pending.id,{verifier:undefined});this.sessions.set(pending.id,{status:'error',error:'Authorization was declined. Connect again when ready.'});throw new Error('Authorization was declined');}
  const callback=this.secret(pending.id).callback;
  const result=await this.connect(pending.id,callback,code);if(result.status!=='connected')throw new Error(result.error??'Authorization did not complete');return result;
 }
 begin(id:string,callback:string){if(!this.app.store.get('mcp',id))throw new Error('Connector not found');this.persist(id,{callback});return this.connect(id,callback);}
 async browserCallback(value:string){
  const url=new URL(value),state=url.searchParams.get('state')??'',pending=this.states.get(state);
  if(!pending)return null;const expected=new URL(this.secret(pending.id).callback);
  if(url.origin!==expected.origin||url.pathname!==expected.pathname)return null;
  try{await this.complete(state,url.searchParams.get('code')??undefined,url.searchParams.get('error')??undefined);return {status:200,body:'<!doctype html><h1>Connected to OpenClaude</h1><p>You can return to your chat.</p>'};}
  catch{return {status:400,body:'<!doctype html><h1>Authorization did not complete</h1><p>Return to Connectors for the status and try again.</p>'};}
 }
 async restore(){for(const item of this.app.store.list('mcp')){const credentials=this.secret(item.id);if(credentials.enabled&&credentials.callback)await this.connect(item.id,credentials.callback);}}
 async close(){await Promise.allSettled([...this.pending.values()]);await Promise.allSettled([...this.sessions.values()].map(session=>session.client?.close()));}
}

export function registerConnectors(app:FastifyInstance,context:AppContext,tools:ToolRegistry){
 const manager=new ConnectorManager(context,tools);context.connectors=manager;
 app.get('/api/connectors',async()=>manager.list());
 app.post('/api/connectors',async(request:any)=>manager.save(request.body));
 app.post('/api/connectors/:id/connect',async(request:any)=>manager.begin(request.params.id,`http://${request.headers.host}/api/connectors/oauth/callback`));
 app.post('/api/connectors/:id/disconnect',async(request:any)=>{await manager.disconnect(request.params.id);return manager.view(request.params.id);});
 app.delete('/api/connectors/:id',async(request:any)=>{await manager.remove(request.params.id);return {ok:true};});
 app.get('/api/connectors/oauth/callback',async(request:any,reply)=>{
  reply.header('Cache-Control','no-store').header('Referrer-Policy','no-referrer').header('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'");
  try{await manager.complete(String(request.query.state??''),request.query.code,request.query.error);return reply.type('text/html').send('<!doctype html><title>Connected · OpenClaude</title><h1>Connector connected</h1><p>You can close this tab and return to OpenClaude.</p>');}
  catch{return reply.code(400).type('text/html').send('<!doctype html><title>Connection failed · OpenClaude</title><h1>Authorization could not be completed</h1><p>Return to OpenClaude to see the connection status and try again.</p>');}
 });
 app.addHook('onReady',()=>{void manager.restore();});app.addHook('onClose',async()=>manager.close());return manager;
}
