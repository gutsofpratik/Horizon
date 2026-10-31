import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import type {AppContext} from '../../app.ts';
import {ecosystemManifest} from './sources.ts';
import {packageMetadata} from './registry.ts';
/** The actual pinned AAS Core handles MCP, stack validation, evidence and search. Horizon owns access. */
export async function createSkillCatalogSession(app:AppContext){
 const engine=join(app.root,'skills/ecosystem/engine');const require=createRequire(join(engine,'package.json'));
 const {McpServer}=require(join(engine,'tools/lib/aas-v1/mcp/index.js'));
 const core=require(join(engine,'tools/lib/aas-v1/index.js'));
 const data=JSON.parse(await readFile(join(app.root,'skills/ecosystem/frameworks/aas/horizon-catalog.json'),'utf8'));
 const catalog=core.syntheticCatalog(data.skills,{package:'horizon-skill-catalog',version:data.sourceRevision});
 const server=new McpServer({root:join(app.root,'skills/ecosystem'),catalog});
 return {async handle(request:any){
  if(!request||request.jsonrpc!=='2.0'||typeof request.method!=='string')return {jsonrpc:'2.0',id:request?.id??null,error:{code:-32600,message:'Invalid MCP request'}};
  const params=request.params??{};let id=params.arguments?.id;
  if(request.method==='resources/read')try{id=decodeURIComponent(new URL(params.uri).pathname.replace(/^\//,''));}catch{return {jsonrpc:'2.0',id:request.id??null,error:{code:-32602,message:'Invalid skill resource URI'}};}
  const reading=request.method==='resources/read'||request.method==='tools/call'&&(['read_skill_file','list_skill_files'].includes(params.name)||params.name==='get_skill'&&params.arguments?.includeContent===true);
  if(reading){const record=data.skills.find((s:any)=>s.id===id);const manifest=await ecosystemManifest(app.root);const pkg=manifest?.packages.find(p=>p.id===record?.horizonPackageId);const status=pkg&&packageMetadata(app,pkg);if(!pkg||!status?.installed||!status.enabled||pkg.license.decision!=='allowed')return {jsonrpc:'2.0',id:request.id??null,error:{code:-32003,message:'Skill content is not installed, enabled, or permitted for this profile'}};}
  const result=await server.handle(request);
  if(request.method==='initialize'&&result?.result?.serverInfo)result.result.serverInfo={...result.result.serverInfo,name:'Horizon Skill Catalog'};
  return result;
 }};
}
export function registerSkillCatalogMcp(app:FastifyInstance,context:AppContext){
 const sessions=new Map<string,{service:Awaited<ReturnType<typeof createSkillCatalogSession>>;touched:number}>();
 app.addHook('onClose',async()=>sessions.clear());
 app.post('/api/skills/ecosystem/mcp',{bodyLimit:1024*1024},async(request:any,reply)=>{
  for(const [id,session]of sessions)if(Date.now()-session.touched>15*60*1000)sessions.delete(id);
  let id=request.headers['mcp-session-id'];if(Array.isArray(id))return reply.code(400).send({error:'One MCP session is required'});
  if(request.body?.method==='initialize'){if(sessions.size>=32)return reply.code(429).send({error:'Too many skill catalog sessions'});id=randomUUID();sessions.set(id,{service:await createSkillCatalogSession(context),touched:Date.now()});}
  const session=sessions.get(id);if(!session)return reply.code(400).send({error:'Initialize an authenticated skill catalog session first'});
  session.touched=Date.now();reply.header('mcp-session-id',id);const result=await session.service.handle(request.body);if(result===null)return reply.code(202).send();return result;
 });
 app.delete('/api/skills/ecosystem/mcp',async(request:any,reply)=>{const id=request.headers['mcp-session-id'];if(typeof id==='string')sessions.delete(id);return reply.code(204).send();});
}
