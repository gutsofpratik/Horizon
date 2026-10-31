import {ecosystemEnabled} from './ecosystem/sources.ts';
import {ecosystemPackage} from './ecosystem/registry.ts';
import {installEcosystemPackage} from './ecosystem/packages.ts';
import {registerEcosystemRoutes} from './ecosystem/routes.ts';
import {installImportedSkill} from './import-package.ts';
import {registerGithubImports} from './github-import.ts';
import {repositoryCatalog,installRepositorySkill} from './repository.ts';
import type {FastifyInstance} from 'fastify';import type {AppContext} from '../app.ts';import {loadCatalog,readSkill,publicSkill} from './catalog.ts';import {randomUUID} from 'node:crypto';import {mkdir,writeFile,readFile,rm} from 'node:fs/promises';import {join} from 'node:path';import JSZip from 'jszip';import {digest,safePath} from '../tools/files.ts';import {z} from 'zod';
import {registerSkillManagement} from './management.ts';
export function registerSkillRoutes(app:FastifyInstance,context:AppContext){
 registerEcosystemRoutes(app,context);registerSkillManagement(app,context);registerGithubImports(app,context);
 app.get('/api/skills',async()=>loadCatalog(context));app.get('/api/skills/:id',async(request:any)=>publicSkill(await readSkill(context,request.params.id)));
 app.post('/api/skills/:id/install',async(request:any)=>{if(await ecosystemEnabled(context)){const pkg=await ecosystemPackage(context,request.params.id);if(pkg){await installEcosystemPackage(context,pkg);await loadCatalog(context);return {id:pkg.id,name:pkg.name,installed:true};}}const skill=await readSkill(context,request.params.id);const catalog=await repositoryCatalog(context);const remote=catalog.skills.find((item:any)=>item.legacyIds?.includes(skill.id));if(remote)return installRepositorySkill(context,remote.id,undefined,skill.id);if(skill.bundledEntry)throw new Error('This legacy package is not redistributable from Horizon Skills. Choose an available repository skill.');context.store.put('skill_installations',{id:skill.id,installed:true,version:skill.version});await loadCatalog(context);return {id:skill.id,name:skill.name,installed:true};});
 app.delete('/api/skills/:id/install',async(request:any)=>{const catalog=await loadCatalog(context);const skill=catalog.find(item=>item.id===request.params.id);if(!skill)throw new Error('Skill not found');context.store.put('skill_installations',{id:skill.id,installed:false,version:skill.version});await loadCatalog(context);return {id:skill.id,installed:false};});
 app.delete('/api/skills/:id',async(request:any)=>{const skill=context.store.get('skills',request.params.id);if(!skill||skill.pluginId&&context.store.get('plugins',skill.pluginId))throw new Error('Remove installed plugin skills through their plugin');const directory=await safePath(join(context.dataDirectory,'skills'),skill.id);await rm(directory,{recursive:true,force:true});context.store.delete('skills',skill.id);context.store.delete('skill_installations',skill.id);return {ok:true};});
 const input=z.object({name:z.string().min(1).max(100),description:z.string().min(1).max(2000),instructions:z.string().min(1).max(100000)}).strict();
 app.post('/api/skills',async(request)=>{const body=input.parse(request.body);const id=randomUUID();const directory=join(context.dataDirectory,'skills',id);await mkdir(directory,{recursive:true});const instructions=`---\nname: ${JSON.stringify(body.name)}\ndescription: ${JSON.stringify(body.description)}\n---\n\n${body.instructions}`;await writeFile(join(directory,'SKILL.md'),instructions);return context.store.put('skills',{id,...body,instructions,version:digest(instructions)});});
 app.post('/api/skills/import',async(request)=>{const part=await request.file();if(!part)throw new Error('Select a SKILL.md or ZIP file');return installImportedSkill(context,await part.toBuffer(),part.filename);
 });
}
