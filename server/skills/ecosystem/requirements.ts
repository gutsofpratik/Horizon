import type {AppContext} from '../../app.ts';
import type {SkillPackage,Requirement} from './types.ts';
export function ecosystemRequirements(app:AppContext,pkg:SkillPackage){return pkg.requirements.map(requirement=>{
 const available=checkRequirement(app,requirement);
 return {id:requirement.id,kind:requirement.kind,status:available?'ready':'unavailable',reason:available?null:'Required '+requirement.kind+' is unavailable: '+requirement.id};
});}
function checkRequirement(app:AppContext,requirement:Requirement){
 const declared=app.ephemeral.get('skillRuntimeRequirements');const value=declared instanceof Map?declared.get(requirement.id):declared?.[requirement.id];
 if(value!==undefined)return value===true;
 const native=app.ephemeral.get('nativeBridge');
 if(requirement.kind==='runtime'){
  if(requirement.id==='office')return app.ephemeral.get('officeRuntime')?.snapshot()?.ready===true;
  if(requirement.id==='pdf')return app.ephemeral.get('documentRuntime')?.snapshot()?.ready===true;
  if(requirement.id==='browser')return !!(native?.browser||app.ephemeral.get('webBrowser'));
  if(requirement.id==='terminal')return !!(native?.terminal||app.runtime?.ready);
 }
 if(requirement.kind==='host')return requirement.id==='desktop'&&!!native;
 return false; // Credentials and unsupported tools are never inferred from source text.
}
