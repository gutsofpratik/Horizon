import type {AppContext} from '../../app.ts';
import {ecosystemManifest,resolvePackage} from './sources.ts';
import {ecosystemRequirements} from './requirements.ts';
import {installedPackageRoot,readPackageFile} from './packages.ts';
import type {SkillPackage} from './types.ts';
import {legacySkillAliases} from './relationships.ts';
export async function ecosystemCatalog(app:AppContext){
 const manifest=await ecosystemManifest(app.root);if(!manifest)return;
 return manifest.packages.filter(p=>p.kind==='skill'&&!p.duplicateOf).map(pkg=>({...packageMetadata(app,pkg),aliases:Object.entries(legacySkillAliases).filter(([,target])=>target===pkg.id).map(([id])=>id)}));
}
export function packageMetadata(app:AppContext,pkg:SkillPackage,details=false){
 const installation=app.store.get('skill_installations',pkg.id),requirementStatus=ecosystemRequirements(app,pkg);
 const installed=installation?.installed??!!pkg.defaultInstalled,enabled=installation?.enabled!==false;
 const available=pkg.license.decision==='allowed';const mapped=pkg.compatibility==='mapped';
 const runtimeReady=mapped&&requirementStatus.every(r=>r.status==='ready');
 const relatedTools=pkg.id==='horizon:adapter:documents'?['sheets','slides','documents','data']:pkg.id==='horizon:adapter:pdf'?['pdf']:pkg.id==='horizon:adapter:artifacts'?['artifact']:pkg.id==='horizon:adapter:interaction'?['browser','computer','shell','file','directory','git','planning','agent']:pkg.category==='Superpowers'?['planning','code','task']:pkg.category==='Research'?['web','research']:pkg.category==='Design'?['artifact','code']:pkg.sourceId==='ECC'?['code','git','file','shell']:[];
 return {id:pkg.id,qualifiedId:pkg.id,name:pkg.name,description:pkg.description,sourceFamily:pkg.sourceId,sourceKind:'extension',version:pkg.digest,sourceRevision:pkg.revision,repository:pkg.repository,sourceUrl:pkg.repository?'https://github.com/'+pkg.repository+'/tree/'+pkg.revision+'/'+pkg.sourcePath.replace(/\/SKILL.md$/i,''):undefined,category:pkg.category,license:pkg.license.label,licenseDecision:pkg.license.decision,licenseEvidence:pkg.license.evidence,requirements:pkg.requirements.map(r=>r.id),requirementStatus,compatibility:pkg.compatibility,installed,enabled,available,runtimeReady,editable:false,ecosystem:true,builtIn:!!pkg.defaultInstalled,pluginId:pkg.pluginId,adapter:pkg.adapter,unavailableReason:!available?pkg.license.reason??'Package license is unresolved':!mapped?'This upstream workflow needs a reviewed Horizon operation binding':!runtimeReady?'Required runtime is unavailable':null,resourceCount:pkg.files.length,resources:details?pkg.files.map(f=>({path:f.path,bytes:f.bytes})):[],provenance:{kind:'extension',sourceId:pkg.sourceId,qualifiedId:pkg.id,version:pkg.digest,repository:pkg.repository,revision:pkg.revision},relatedTools};
}
export async function ecosystemPackage(app:AppContext,id:string){const manifest=await ecosystemManifest(app.root);return manifest&&resolvePackage(manifest.packages,id);}
export async function readEcosystemSkill(app:AppContext,id:string){
 let pkg=await ecosystemPackage(app,id);if(!pkg)return;const snapshot=app.store.get('skill_installations',pkg.id)?.packageSnapshot;if(snapshot?.id===pkg.id&&snapshot.digest===app.store.get('skill_installations',pkg.id)?.version)pkg=snapshot as SkillPackage;
 const metadata=packageMetadata(app,pkg,true);let instructions='';
 if(metadata.installed&&metadata.available)instructions=(await readPackageFile(app,pkg,pkg.entrypoint??'SKILL.md')).toString('utf8');
 return {...metadata,instructions,resourceRoot:installedPackageRoot(app,pkg),package:pkg};
}
