import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,rename,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {AppContext} from '../app.ts';
import {ToolError} from '../tools/registry.ts';
import {digest} from '../tools/files.ts';

export const skillContent=z.object({name:z.string().trim().min(1).max(100),description:z.string().trim().min(1).max(2000),instructions:z.string().trim().min(1).max(100000)}).strict();
export async function saveAuthoredSkill(app:AppContext,body:z.infer<typeof skillContent>,id?:string,expectedVersion?:string){
 const key='skill-authoring:'+id;
 if(id&&app.ephemeral.has(key))throw new ToolError('SKILL_CONFLICT','Skill is being edited; read it again before retrying');
 if(id)app.ephemeral.set(key,true);
 let staging='';
 try{
  const previous=id?app.store.get('skills',id):undefined;
  if(id&&(!previous||previous.pluginId||previous.repository))throw new ToolError('SKILL_READ_ONLY','Only standalone personal skills can be edited; create a personal copy instead');
  if(id&&previous!.version!==expectedVersion)throw new ToolError('SKILL_CONFLICT','Skill changed; load its current version before editing');
  id??=randomUUID();
  const root=join(app.dataDirectory,'skills',id);await mkdir(root,{recursive:true});
  const instructions='---\nname: '+JSON.stringify(body.name)+'\ndescription: '+JSON.stringify(body.description)+'\n---\n\n'+body.instructions.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/,'');
  const target=join(root,'SKILL.md');staging=join(root,'.author-'+randomUUID());
  let original:string|undefined;try{original=await readFile(target,'utf8');}catch(error:any){if(error.code!=='ENOENT')throw error;}
  await writeFile(staging,instructions,'utf8');await rename(staging,target);staging='';
  let skill;
  try{skill=app.store.put('skills',{...previous,id,...body,instructions,version:digest(instructions),createdBy:'assistant'});}
  catch(error){if(original!==undefined)await writeFile(target,original,'utf8');else await rm(target,{force:true});throw error;}
  const installation=app.store.get('skill_installations',id);app.store.put('skill_installations',{...installation,id,installed:installation?.installed??true,enabled:installation?.enabled??true,version:skill.version});
  return skill;
 }finally{if(staging)await rm(staging,{force:true});app.ephemeral.delete(key);}
}
