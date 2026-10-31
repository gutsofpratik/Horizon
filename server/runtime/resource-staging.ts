import {lstat,readdir,readFile} from 'node:fs/promises';import {join} from 'node:path';
import {ToolError,type ToolContext} from '../tools/registry.ts';import {projectKey} from '../tools/files.ts';
/** Copy only bounded regular resources to an explicitly selected worker. No host execution. */
export async function stageExecutionResources(ctx:ToolContext,source:string,destination:string){
 if(!ctx.executionEnvironmentId)return;
 const service=ctx.app.ephemeral.get('executionEnvironments');if(!service)throw new ToolError('ENVIRONMENT_UNAVAILABLE','The selected isolated worker is not connected');
 let environment=service.get(ctx.executionEnvironmentId);const scope=projectKey(ctx);
 if(environment.boundScope&&environment.boundScope!==scope)throw new ToolError('ENVIRONMENT_SCOPE','Skill execution environment belongs to another workspace');
 const root=await lstat(source);if(!root.isDirectory()||root.isSymbolicLink())throw new ToolError('UNSAFE_SKILL_RESOURCE','Skill resources must be a regular directory');
 const files:{path:string;bytes:Buffer}[]=[];let size=0,entries=0;
 const collect=async(folder:string,prefix:string,depth=0)=>{ctx.signal.throwIfAborted();if(depth>20)throw new ToolError('SKILL_RESOURCE_LIMIT','Skill resources exceed 20 directory levels');for(const entry of await readdir(folder,{withFileTypes:true})){ctx.signal.throwIfAborted();if(++entries>1000)throw new ToolError('SKILL_RESOURCE_LIMIT','Skill resources exceed 1000 entries');const path=prefix?prefix+'/'+entry.name:entry.name;
  if(entry.isSymbolicLink())throw new ToolError('UNSAFE_SKILL_RESOURCE','Supporting resources cannot contain symbolic links');
  if(entry.isDirectory())await collect(join(folder,entry.name),path,depth+1);
  else if(entry.isFile()){if(files.length>=1000)throw new ToolError('SKILL_RESOURCE_LIMIT','Skill resources exceed 1000 files');const info=await lstat(join(folder,entry.name));if(info.size>8000000)throw new ToolError('FILE_TOO_LARGE','Remote skill resources must be under 8 MB each');const bytes=await readFile(join(folder,entry.name));size+=bytes.length;if(bytes.length>8000000||size>20000000)throw new ToolError('SKILL_RESOURCE_LIMIT','Skill resources exceed the transfer limit');files.push({path,bytes});}
  else throw new ToolError('UNSAFE_SKILL_RESOURCE','Supporting resources must be regular files');
 }};await collect(source,'');
 if(!environment.boundScope)environment=ctx.app.store.put('execution_environments',{...environment,boundScope:scope});
 for(const file of files)await service.call(environment,'workspace_write',{path:destination+'/'+file.path,content:file.bytes.toString('base64'),overwrite:false},scope+':'+ctx.conversationId,ctx.signal);
}
