import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {safePath} from '../../tools/files.ts';
import {randomUUID} from 'node:crypto';
import type {AppContext} from '../../app.ts';
import {canonicalAlias} from './relationships.ts';
import type {SkillPackage} from './types.ts';
/** Preserve the original skill rows/resources. Only reversible references are migrated. */
export async function migrateSkillReferences(app:AppContext,packages:SkillPackage[]){
 const key='upstream-skills-v1';if(app.store.get('skill_migrations',key))return;
 const running=app.ephemeral.get(key);if(running)return running;
 const work=(async()=>{
  const ids=new Set(packages.map(p=>p.id)),custom=new Set(app.store.list('skills').filter(s=>!s.builtIn&&!s.catalogSource).map(s=>s.id));
  const map=(id:string)=>custom.has(id)?id:ids.has(canonicalAlias(id))?canonicalAlias(id):id;
  const installations=app.store.list('skill_installations');const conversations=app.store.list('conversations').filter(c=>c.skillIds?.length||Object.keys(c.skillBindings??{}).length);
  const assistants=app.store.list('assistants');const referenceMap=Object.fromEntries([...new Set([...installations.map(i=>i.id),...conversations.flatMap(c=>[...(c.skillIds??[]),...Object.keys(c.skillBindings??{})]),...assistants.flatMap(a=>a.skillIds??[])])].map(id=>[id,map(id)]));
  const snapshot={version:1,referenceMap,installations,conversations:conversations.map(c=>({id:c.id,skillIds:c.skillIds,skillBindings:c.skillBindings})),assistants:assistants.map(a=>({id:a.id,skillIds:a.skillIds}))};
  const directory=join(app.dataDirectory,'backups','skill-ecosystem');await mkdir(directory,{recursive:true});const file=join(directory,randomUUID()+'.json');await writeFile(file,JSON.stringify(snapshot),{mode:0o600,flag:'wx'});
  app.store.transaction(()=>{
   for(const installation of installations){const id=map(installation.id);if(id!==installation.id&&!app.store.get('skill_installations',id))app.store.put('skill_installations',{...installation,id,migratedFrom:installation.id,version:packages.find(p=>p.id===id)!.digest});}
   for(const conversation of conversations){const bindings:Record<string,string>={};for(const [old,mode]of Object.entries(conversation.skillBindings??{})){const id=map(old);if(bindings[id]!=='exclude'||mode==='exclude')bindings[id]=String(mode);}for(const [id,mode]of Object.entries(conversation.skillBindings??{}))if(ids.has(id))bindings[id]=String(mode);app.store.put('conversations',{...conversation,skillIds:conversation.skillIds?.map(map),skillBindings:bindings});}
   for(const assistant of assistants)if(Array.isArray(assistant.skillIds))app.store.put('assistants',{...assistant,skillIds:assistant.skillIds.map(map)});
   app.store.put('skill_migrations',{id:key,status:'completed',backup:file,referenceMap,aliasesPreserved:true,completedAt:new Date().toISOString()});
  });
 })();app.ephemeral.set(key,work);try{return await work;}finally{app.ephemeral.delete(key);}
}

export function previewSkillMigration(app:AppContext,packages:SkillPackage[]){
 const ids=new Set(packages.map(p=>p.id));const custom=new Set(app.store.list('skills').map(s=>s.id));
 const references=new Set(app.store.list('conversations').flatMap(c=>[...(c.skillIds??[]),...Object.keys(c.skillBindings??{})]));
 return {completed:!!app.store.get('skill_migrations','upstream-skills-v1'),references:[...references].map(id=>({from:id,to:custom.has(id)?id:ids.has(canonicalAlias(id))?canonicalAlias(id):id,preservedCustom:custom.has(id)})),preservesMessages:true};
}

/** Revert only skill references that have not been edited since migration. */
export async function rollbackSkillMigration(app:AppContext):Promise<{restored:number;conflicts:string[];ecosystemEnabled?:boolean}>{
 const record=app.store.get('skill_migrations','upstream-skills-v1');if(!record)return {restored:0,conflicts:[]};
 const directory=join(app.dataDirectory,'backups','skill-ecosystem');const file=await safePath(directory,relative(directory,record.backup));
 const source=await readFile(file,'utf8');if(Buffer.byteLength(source)>64*1024*1024)throw Error('Skill migration backup exceeds limit');
 const backup=JSON.parse(source);if(backup.version!==1||!backup.referenceMap||!Array.isArray(backup.conversations)||!Array.isArray(backup.assistants))throw Error('This backup requires manual reference recovery; it has no verified mapping ledger');
 const map=(id:string)=>backup.referenceMap[id]??id;const same=(a:any,b:any)=>JSON.stringify(a??null)===JSON.stringify(b??null);
 const bindings=(value:any)=>{const result:Record<string,string>={};for(const [id,mode]of Object.entries(value??{})){const key=map(id);if(result[key]!=='exclude'||mode==='exclude')result[key]=String(mode);}for(const [id,mode]of Object.entries(value??{}))if(map(id)===id)result[id]=String(mode);return result;};
 let restored=0;const conflicts:string[]=[];
 app.store.transaction(()=>{
  for(const old of backup.conversations){const current=app.store.get('conversations',old.id);if(!current)continue;
   if(!same(current.skillIds,old.skillIds?.map(map))||!same(current.skillBindings,bindings(old.skillBindings))){conflicts.push('conversation:'+old.id);continue;}
   app.store.put('conversations',{...current,skillIds:old.skillIds,skillBindings:old.skillBindings});restored++;
  }
  for(const old of backup.assistants){const current=app.store.get('assistants',old.id);if(!current||!Array.isArray(old.skillIds))continue;
   if(!same(current.skillIds,old.skillIds.map(map))){conflicts.push('assistant:'+old.id);continue;}
   app.store.put('assistants',{...current,skillIds:old.skillIds});restored++;
  }
  for(const old of backup.installations??[]){const id=map(old.id);if(id===old.id)continue;const current=app.store.get('skill_installations',id);
   if(current&&current.migratedFrom===old.id&&!current.packageRoot&&current.installed===old.installed&&current.enabled===old.enabled)app.store.delete('skill_installations',id);
  }
  const settings=app.store.get('settings','main')??{id:'main'};app.store.put('settings',{...settings,skillEcosystemEnabled:false});
  app.store.put('skill_migrations',{...record,status:'rolled_back',restored,conflicts,rolledBackAt:new Date().toISOString()});
 });
 app.ephemeral.set('skillEcosystemEnabled',false);app.ephemeral.delete('installedSkills');return {restored,conflicts,ecosystemEnabled:false};
}
