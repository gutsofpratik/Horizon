import {registerOfficialPluginRoutes} from './skills/official-plugins.ts';
import {registerConnectors,type ConnectorManager} from './connectors/manager.ts';
import {registerWebhooks} from './tools/webhooks.ts';
import {registerNativeBroker} from './runtime/native-broker.ts';
import {registerModelRuntime} from './models/runtime.ts';
import {registerWebBrowser} from './browser/web.ts';
import {validateSettings} from './settings/validation.ts';
import {registerReflectRoutes} from './settings/reflect.ts';
import Fastify,{type FastifyInstance} from 'fastify';
import multipart from '@fastify/multipart';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Store} from './storage/database.ts';
import {registerProviderRoutes} from './providers/routes.ts';
import {createTools} from './tools/index.ts';import {registerAgentRoutes} from './agent/routes.ts';
import {registerSkillRoutes} from './skills/routes.ts';import {registerFileRoutes} from './files/routes.ts';import {searchWeb} from './search/provider.ts';
import {SandboxManager} from './runtime/docker.ts';
import {registerPluginRoutes} from './skills/plugins.ts';
import {registerRepositoryRoutes} from './skills/repository.ts';
import {registerScheduleRoutes} from './tools/schedules.ts';
export interface AppContext {store:Store;dataDirectory:string;root:string;ephemeral:Map<string,any>;runtime?:SandboxManager;connectors?:ConnectorManager}
export async function createApp(options:{dataDirectory:string;dbPath?:string;root?:string}):Promise<FastifyInstance> {
  const app=Fastify({logger:false,bodyLimit:12*1024*1024});
  mkdirSync(options.dataDirectory,{recursive:true});
  const store=new Store(options.dbPath??join(options.dataDirectory,'state.sqlite'));
  const context:AppContext={store,dataDirectory:options.dataDirectory,root:options.root??process.cwd(),ephemeral:new Map()};
  app.decorate('context',context);
  context.runtime=new SandboxManager(context);
  app.addHook('onClose',async()=>store.close());
  app.addHook('onRequest',async(request,reply)=>{
    let host:URL;
    try{host=new URL('http://'+request.headers.host);}catch{return reply.code(403).send({error:'Only local workspace hosts are allowed'});}
    if(!['localhost','127.0.0.1','[::1]'].includes(host.hostname)||host.username||host.password)return reply.code(403).send({error:'Only local workspace hosts are allowed'});
    const origin=request.headers.origin;
    if(origin){try{const source=new URL(origin);if(!['http:','https:'].includes(source.protocol)||source.host!==host.host||source.username||source.password)return reply.code(403).send({error:'Cross-origin requests are disabled'});}catch{return reply.code(403).send({error:'Cross-origin requests are disabled'});}}
  });
  app.setErrorHandler((error,request,reply)=>{const fault=error as any;reply.code(fault.statusCode??400).send({error:fault.message??'Request failed',code:fault.code??'REQUEST_FAILED'});});
  await app.register(multipart,{limits:{fileSize:10*1024*1024,files:8}});
  if(!store.get('providers','ollama'))store.put('providers',{id:'ollama',name:'Ollama',type:'ollama',baseUrl:'http://127.0.0.1:11434'});
  if(!store.get('settings','main'))store.put('settings',{id:'main',theme:'light',userName:'',model:'qwen3.5:9b-q4_K_M',providerId:'ollama',temperature:0.7,numCtx:8192,maxTokens:4096,thinking:true,toolsEnabled:true,searchProvider:'auto',searchUrl:'http://127.0.0.1:8081',searchLanguage:'en',safeSearch:1});
  app.post('/api/native/connect',async(request:any)=>{const body=request.body;const endpoint=new URL(body.origin);if(endpoint.protocol!=='http:'||endpoint.hostname!=='127.0.0.1'||!/^\d+$/.test(endpoint.port)||typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))throw new Error('Invalid native bridge');const response=await fetch(endpoint.origin+'/status',{headers:{Authorization:'Bearer '+body.token},signal:AbortSignal.timeout(2000)});if(!response.ok)throw new Error('Native bridge authentication failed');const capabilities=await response.json();context.ephemeral.set('nativeBridge',{origin:endpoint.origin,token:body.token,terminal:!!capabilities.terminal,updated:Date.now()});return {connected:true};});
  app.get('/api/health',async()=>({app:'OpenClaude',status:'ok',storage:'ready',version:'0.1.2',desktopOwned:process.env.OPENCLAUDE_DESKTOP_OWNED==='1'}));
  registerNativeBroker(app,context);
  registerModelRuntime(app,context);
  registerWebhooks(app,context);
  registerWebBrowser(app,context);
  app.get('/api/runtime/health',async()=>context.runtime!.health());
  app.post('/api/runtime/start',async()=>context.runtime!.startSetup());
  app.get('/api/runtime/setup',async()=>context.runtime!.setup);
  const buckets=new Set(['projects','conversations','artifacts','memories','plans','providers','settings','mcp']);
  const sanitize=(bucket:string,entity:any)=>bucket==='providers'?{...entity,apiKey:undefined,hasApiKey:!!entity.apiKey}:bucket==='settings'?{...entity,searchApiKey:undefined,searchApiKeys:undefined,searchApiKeyProviders:Object.keys(entity.searchApiKeys??{}).filter(key=>entity.searchApiKeys[key])}:entity;
  const bucketOf=(request:any)=>{const bucket=request.params.bucket;if(!buckets.has(bucket))throw new Error('Unknown resource');return bucket;};
  app.get('/api/entities/:bucket',async(request:any)=>{const bucket=bucketOf(request);const results=bucket==='mcp'?context.connectors!.list():request.query.q?store.search(bucket,String(request.query.q),request.query.summary==='true'):store.list(bucket,request.query.summary==='true');return results.map(entity=>sanitize(bucket,entity));});
  app.get('/api/entities/:bucket/:id',async(request:any,reply)=>{const bucket=bucketOf(request);const entity=bucket==='mcp'?context.connectors!.list().find(item=>item.id===request.params.id):store.get(bucket,request.params.id)??context.ephemeral.get(request.params.id);if(!entity)return reply.code(404).send({error:'Not found'});return sanitize(bucket,entity);});
  app.post('/api/entities/:bucket',async(request:any)=>{const bucket=bucketOf(request);const body=request.body as Record<string,any>;if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Expected an object');if(bucket==='mcp')return context.connectors!.save(body);const id=String(body.id??randomUUID());const privatePrevious=bucket==='conversations'?context.ephemeral.get(id):undefined;const previous=store.get(bucket,id)??privatePrevious??{};if(privatePrevious?.incognito&&Object.hasOwn(body,'incognito')&&body.incognito!==true)throw new Error('Private conversations cannot be converted to saved chats');const entity:Record<string,any>&{id:string}={...previous,...body,id};if(bucket==='settings')validateSettings(entity);if(bucket==='providers'){if(previous.baseUrl&&previous.baseUrl!==entity.baseUrl&&!Object.hasOwn(body,'apiKey'))entity.apiKey='';if(entity.modelIds!==undefined&&(!Array.isArray(entity.modelIds)||entity.modelIds.length>200||entity.modelIds.some((id:any)=>typeof id!=='string'||!id.trim()||id.length>300)))throw new Error('Model IDs must be a list of up to 200 nonempty strings');if(entity.apiKey!==undefined&&(typeof entity.apiKey!=='string'||entity.apiKey.length>4096||/[\r\n]/.test(entity.apiKey)))throw new Error('Invalid provider API key');if(!['ollama','openai'].includes(entity.type))throw new Error('Unknown provider type');const url=new URL(entity.baseUrl);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Invalid provider URL');if(entity.apiKey&&url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('Use HTTPS for remote providers with API keys');}if(bucket==='conversations'&&entity.incognito){context.ephemeral.set(id,entity);return entity;}return sanitize(bucket,store.put(bucket,entity));});
  app.delete('/api/entities/:bucket/:id',async(request:any)=>{const bucket=bucketOf(request);if(bucket==='mcp'){await context.connectors!.remove(request.params.id);return {ok:true};}store.delete(bucket,request.params.id);context.ephemeral.delete(request.params.id);return {ok:true};});
  registerProviderRoutes(app,context);
  const tools=createTools(context);app.decorate('tools',tools);registerConnectors(app,context,tools);registerAgentRoutes(app,context,tools);
  registerSkillRoutes(app,context);registerFileRoutes(app,context,tools);
  registerPluginRoutes(app,context);registerReflectRoutes(app,context);
  registerRepositoryRoutes(app,context);registerOfficialPluginRoutes(app,context);registerScheduleRoutes(app,context);
  app.post('/api/search/credentials',async(request:any)=>{const body=request.body;if(!body||!['brave','tavily','custom'].includes(body.provider)||typeof body.apiKey!=='string'||body.apiKey.length>4096||/[\r\n]/.test(body.apiKey))throw new Error('Invalid search credentials');const settings=store.get('settings','main')!;const searchApiKeys={...settings.searchApiKeys,[body.provider]:body.apiKey};store.put('settings',{...settings,searchApiKeys});return {providers:Object.keys(searchApiKeys).filter(key=>searchApiKeys[key])};});
  app.post('/api/search/test',async()=>{try{const result=await searchWeb(context,'OpenClaude',1);return {status:'connected',provider:result.provider,fallback:result.fallback,results:result.sources.length,engineWarnings:result.engineWarnings};}catch(error){context.ephemeral.set('searchHealth',{ready:false,error:(error as Error).message});throw error;}});
  return app;
}
