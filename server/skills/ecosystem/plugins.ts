import type {AppContext} from '../../app.ts';
import {ecosystemManifest} from './sources.ts';
import {installEcosystemPackage} from './packages.ts';
export async function ecosystemPlugins(app:AppContext){const manifest=await ecosystemManifest(app.root);return (manifest?.plugins??[]).map(plugin=>{const installation=app.store.list('plugins').find(p=>p.ecosystemPluginId===plugin.id);return {...plugin,sourceUrl:'https://github.com/'+plugin.repository+'/tree/'+plugin.revision+'/'+plugin.sourcePath,installed:!!installation,installation,available:plugin.license.decision==='allowed',category:String((plugin.manifest.interface as any)?.category??'Workflows'),author:plugin.manifest.author};});}
export async function installEcosystemPlugin(app:AppContext,id:string){
 const manifest=await ecosystemManifest(app.root),plugin=manifest?.plugins?.find(p=>p.id===id);if(!plugin)throw Error('Pinned plugin not found');if(plugin.license.decision!=='allowed')throw Error(plugin.license.reason??'Plugin distribution terms require review');
 const skills=plugin.skillIds.map(id=>manifest!.packages.find(p=>p.id===id)!).filter(p=>p.license.decision==='allowed'&&!p.duplicateOf);
 if(!skills.length)throw Error('This plugin has no independently permitted skill components; its host integration must be configured separately');
 const before=new Map(skills.map(p=>[p.id,app.store.get('skill_installations',p.id)]));const completed:string[]=[];
 try{for(const pkg of skills){await installEcosystemPackage(app,pkg);completed.push(pkg.id);}const existing=app.store.list('plugins').find(p=>p.ecosystemPluginId===id);return app.store.put('plugins',{id:existing?.id??id,ecosystemPluginId:id,officialPluginId:id,name:plugin.name,description:plugin.description,repository:plugin.repository,sourceRevision:plugin.revision,sourceUrl:'https://github.com/'+plugin.repository+'/tree/'+plugin.revision+'/'+plugin.sourcePath,enabled:true,skillIds:skills.map(p=>p.id),components:plugin.components.map(c=>c.name==='Skills'?{...c,status:'installed'}:c),kind:'upstream',license:plugin.license.label});}
 catch(error){for(const id of completed){const record=before.get(id);if(record)app.store.put('skill_installations',record);else app.store.delete('skill_installations',id);}throw error;}
}
