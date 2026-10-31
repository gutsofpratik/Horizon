import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import type {AppContext} from '../../app.ts';
const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
export async function frameworkComponents(app:AppContext){return JSON.parse(await readFile(join(app.root,'skills/ecosystem/frameworks/ecc/components.json'),'utf8'));}
export async function readFrameworkResource(app:AppContext,path:string){const index=await frameworkComponents(app);if(path==='index.json')return JSON.stringify(index);const component=index.components.find((c:any)=>c.path===path);if(!component)throw Error('Unknown declared ECC framework resource');const data=await readFile(join(app.root,'skills/ecosystem/frameworks/ecc',component.path));if(sha(data)!==component.sha256)throw Error('Framework resource differs from its pinned original');return data.toString('utf8');}
/** Installing templates is not spawning agents or enabling upstream hooks. */
export async function syncFrameworkTemplates(app:AppContext){
 if(app.ephemeral.get('eccFrameworkReady'))return;
 const index=await frameworkComponents(app),pluginId='ecosystem:ecc';
 const roles=await Promise.all(index.components.filter((c:any)=>c.kind==='agents').map(async(component:any)=>({...component,instructions:await readFrameworkResource(app,component.path)})));
 if(!app.store.get('plugins',pluginId))app.store.put('plugins',{id:pluginId,name:'ECC workflows',enabled:true,repository:index.repository,sourceRevision:index.revision,kind:'framework',ecosystemFramework:true});
 app.store.transaction(()=>{for(const component of roles){const hash=sha(component.id);const id=hash.slice(0,8)+'-'+hash.slice(8,12)+'-8'+hash.slice(13,16)+'-a'+hash.slice(17,20)+'-'+hash.slice(20,32);const previous=app.store.get('agent_templates',id);if(previous&&previous.version===component.sha256&&sha(previous.instructions??'')===component.sha256)continue;if(previous&&(!previous.ecosystemSource||sha(previous.instructions??'')!==previous.version))continue;app.store.put('agent_templates',{id,pluginId,name:component.name,description:'Original ECC '+component.name+' specialization',resource:component.path,ecosystemSource:component.id,sourceRevision:index.revision,version:component.sha256,instructions:component.instructions});}});
 app.ephemeral.set('eccFrameworkReady',true);
}
