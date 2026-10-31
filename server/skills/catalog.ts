import {syncFrameworkTemplates} from './ecosystem/frameworks.ts';
import {ecosystemEnabled,ecosystemManifest} from './ecosystem/sources.ts';
import {ecosystemCatalog,readEcosystemSkill} from './ecosystem/registry.ts';
import {migrateSkillReferences} from './ecosystem/migration.ts';
import {relatedTools} from '../tools/guidance.ts';
import {bundledWorkflows} from './workflows.ts';
export function skillProvenance(skill:any){
 const kind=skill.builtIn?'built-in':skill.pluginId||skill.repository||skill.catalogSource||skill.bundledEntry?'extension':'custom';
 const sourceId=skill.pluginId??skill.repository??(kind==='built-in'?'openclaude':kind==='custom'?'personal':skill.sourceFamily??'imported');
 return {kind,sourceId,qualifiedId:[kind,sourceId,skill.id].map(encodeURIComponent).join(':'),version:skill.version??skill.sha256??null,repository:skill.repository??null,revision:skill.sourceRevision??null,copiedFrom:skill.copiedFrom??null};
}
export function skillRequirementStatus(app:AppContext,skill:any){
 return (skill.requirements??[]).map((requirement:string)=>{
  const registered=app.ephemeral.get('skillRuntimeRequirements') as Map<string,boolean>|Record<string,boolean>|undefined;
  const value=registered instanceof Map?registered.get(requirement):registered?.[requirement];
  const ready=value??(requirement==='agent-delegation-adapter'?!!app.ephemeral.get('agent'):false);
  return {id:requirement,status:ready?'ready':'unavailable',reason:ready?null:'Required runtime integration is unavailable: '+requirement};
 });
}
import {readFile} from 'node:fs/promises';import {join,dirname} from 'node:path';import type {AppContext} from '../app.ts';import {digest,safePath} from '../tools/files.ts';import {ToolError} from '../tools/registry.ts';
async function loadLegacyCatalog(app:AppContext):Promise<any[]>{
 let source:any={skills:[]};try{source=JSON.parse(await readFile(join(app.root,'skills/catalog.json'),'utf8'));}catch{}
 const runtimeWorkflows=await bundledWorkflows(app.root);for(const workflow of runtimeWorkflows){const bundledEntry='built-in/'+workflow.folder+'/SKILL.md';try{const text=await readFile(join(app.root,'skills',bundledEntry),'utf8');const entry={id:workflow.id,name:workflow.name,description:workflow.description,bundledEntry,sha256:digest(text),requirements:[],sourceFamily:'Horizon',builtIn:true,category:workflow.category??'Workflows',subcategory:workflow.subcategory,workflowRoutes:workflow.routes??[],workflowTools:workflow.tools,upstreamSkillId:workflow.upstreamSkillId};const index=source.skills.findIndex((skill:any)=>skill.id===workflow.id);if(index<0)source.skills.push(entry);else source.skills[index]=entry;}catch(error){if((error as any).code!=='ENOENT')throw error;}}

 const imports=source.skills.map((skill:any)=>({id:skill.id,name:skill.name,description:skill.description,catalogSource:true,sourceFamily:skill.sourceFamily,version:skill.sha256,bundledEntry:skill.bundledEntry,requirements:skill.requirements??[],builtIn:!!skill.builtIn,category:skill.category??(String(skill.id).includes("/superpowers/")?"Superpowers":undefined),subcategory:skill.subcategory,workflowRoutes:skill.workflowRoutes??[],workflowTools:skill.workflowTools??[],upstreamSkillId:skill.upstreamSkillId,available:!!skill.bundledEntry&&(!(skill.requirements??[]).includes('agent-delegation-adapter')||!!app.ephemeral.get('agent')),unavailableReason:!skill.bundledEntry?'This source requires its original runtime or an app-specific adapter.':(skill.requirements??[]).includes('agent-delegation-adapter')&&!app.ephemeral.get('agent')?'This workflow requires an agent delegation adapter.':null}));
 if(!app.store.get('skill_migrations','installed-library-v1')){const legacy=new Set(app.store.list('conversations').flatMap(chat=>chat.skillIds??[]));for(const skill of imports)if(skill.available&&legacy.has(skill.id)&&!app.store.get('skill_installations',skill.id))app.store.put('skill_installations',{id:skill.id,installed:true,version:skill.version});app.store.put('skill_migrations',{id:'installed-library-v1',completed:true});}
 const catalog=[...app.store.list('skills').map(skill=>({...skill,available:true,sourceFamily:skill.pluginId?(skill.sourceFamily??'Plugin'):skill.repository?(skill.sourceFamily??'Horizon Skills'):'Personal',instructions:undefined})),...imports.filter((skill:any)=>!app.store.get('skills',skill.id))].map(skill=>({...skill,installed:(app.store.get('skill_installations',skill.id)?.installed??(skill.sourceFamily==='Personal'||skill.builtIn||!!skill.repository)),enabled:app.store.get('skill_installations',skill.id)?.enabled!==false,relatedTools:relatedTools(skill),editable:skill.sourceFamily==='Personal'&&!skill.pluginId}));
 const layered=catalog.map(skill=>{const provenance=skillProvenance(skill),requirementStatus=skillRequirementStatus(app,skill),plugin=skill.pluginId?app.store.get('plugins',skill.pluginId):undefined;return {...skill,provenance,sourceKind:provenance.kind,qualifiedId:provenance.qualifiedId,requirementStatus,enabled:skill.enabled&&(!skill.pluginId||!!plugin&&plugin.enabled!==false),runtimeReady:requirementStatus.every((item:any)=>item.status==='ready')};});
 app.ephemeral.set('installedSkills',layered.filter(skill=>skill.installed&&skill.available&&skill.enabled&&skill.runtimeReady).map(skill=>({id:skill.id,name:skill.name,description:skill.description,version:skill.version,relatedTools:skill.relatedTools,provenance:skill.provenance})));
 return layered;
}
export async function loadCatalog(app:AppContext):Promise<any[]>{
 if(!await ecosystemEnabled(app))return loadLegacyCatalog(app);
 const manifest=await ecosystemManifest(app.root);if(!manifest)throw Error('The enabled skill ecosystem is missing its pinned manifest');
 await migrateSkillReferences(app,manifest.packages);await syncFrameworkTemplates(app);
 const upstream=await ecosystemCatalog(app)??[];
 const custom=app.store.list('skills').map(skill=>{const installation=app.store.get('skill_installations',skill.id);const requirementStatus=skillRequirementStatus(app,skill);const plugin=skill.pluginId?app.store.get('plugins',skill.pluginId):undefined;const enabled=installation?.enabled!==false&&(!skill.pluginId||!!plugin&&plugin.enabled!==false);return {...skill,instructions:undefined,sourceFamily:skill.pluginId?(skill.sourceFamily??'Plugin'):skill.repository?(skill.sourceFamily??'Imported'):'Personal',installed:installation?.installed??true,enabled,available:true,runtimeReady:requirementStatus.every((r:any)=>r.status==='ready'),requirementStatus,editable:!skill.pluginId&&!skill.repository,provenance:skillProvenance(skill),qualifiedId:skillProvenance(skill).qualifiedId,relatedTools:relatedTools(skill)};});
 const catalog=[...custom,...upstream.filter(skill=>!custom.some(c=>c.id===skill.id))];
 app.ephemeral.set('installedSkills',catalog.filter(s=>s.installed&&s.enabled&&s.available&&s.runtimeReady));
 return catalog;
}
export async function readSkill(app:AppContext,id:string){if(await ecosystemEnabled(app)&&!app.store.get('skills',id)){const skill=await readEcosystemSkill(app,id);if(skill)return skill;}const catalog=await loadCatalog(app);const exact=catalog.find(item=>item.id===id||item.qualifiedId===id);const named=catalog.filter(item=>item.name===id&&item.available);if(!exact&&named.length>1)throw new ToolError('AMBIGUOUS_SKILL','Several installed skills have this name. Use the source-qualified ID returned by skills_list.');const skill=exact??named[0];if(!skill)throw new ToolError('SKILL_NOT_FOUND','Skill not found');const personal=app.store.get('skills',skill.id);if(personal)return {...skill,instructions:personal.instructions,resourceRoot:join(app.dataDirectory,'skills',skill.id)};if(!skill.bundledEntry)return {...skill,instructions:''};const file=await safePath(join(app.root,'skills'),skill.bundledEntry);const instructions=await readFile(file,'utf8');if(digest(instructions)!==skill.version)throw new ToolError('SKILL_CHANGED','Imported skill changed; review the current version before loading');return {...skill,instructions,resourceRoot:dirname(file)};}
export function publicSkill(skill:any){const {resourceRoot,bundledEntry,package:sourcePackage,...data}=skill;return data;}
