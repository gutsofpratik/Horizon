import {readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import type {ToolContext} from '../tools/registry.ts';
import {safePath,workspaceRoot,digest} from '../tools/files.ts';
/** Only granted workspace paths. No traversal to user-home or arbitrary host guidance. */
export async function repositoryInstructions(ctx:ToolContext){if(!ctx.app.dataDirectory)return [];const project=ctx.projectId?ctx.app.store.get('projects',ctx.projectId):undefined;const paths=Array.isArray(project?.repositories)&&project.repositories.length?project.repositories.filter((value:any)=>typeof value==='string').slice(0,8):['.'];const sources:{path:string;hash:string;text:string}[]=[];let budget=20000;
 for(const folder of paths){const segments=folder.replaceAll('\\','/').split('/').filter((part:string)=>part&&part!=='.');const levels=['.',...segments.map((_part:string,index:number)=>segments.slice(0,index+1).join('/'))];for(const level of levels){let selected:{path:string;text:string}|undefined;for(const filename of ['AGENTS.override.md','AGENTS.md']){const path=join(level,filename).replaceAll('\\','/');if(sources.some(source=>source.path===path))break;try{const absolute=await safePath(workspaceRoot(ctx),path),info=await stat(absolute);if(!info.isFile()||info.size>20000)continue;selected={path,text:(await readFile(absolute,'utf8')).slice(0,budget)};break;}catch(error:any){if(!['ENOENT','ENOTDIR'].includes(error?.code))ctx.emit?.('guidance.skipped',{path,code:error?.code??'GUIDANCE_UNREADABLE'});}}if(selected&&selected.text&&budget>0){sources.push({...selected,hash:digest(selected.text)});budget-=selected.text.length;}}}
 return sources;
}
