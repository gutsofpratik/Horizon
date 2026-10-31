import {posix} from 'node:path';
import type {AppContext} from '../../app.ts';
import {ecosystemManifest} from './sources.ts';
import {ecosystemPackage} from './registry.ts';
import {readPackageFile} from './packages.ts';
import {nativeBindingInstructions} from './bindings.ts';
import type {SkillPackage} from './types.ts';
export function compileSkillInstructions(name:string,body:string){return body+'\n\n'+nativeBindingInstructions+'\nSource package: '+name+'. Load linked stages/resources only when relevant; do not reload this body every tool round.';}
export async function readEcosystemResource(app:AppContext,id:string,resource:string){
 const candidate=await ecosystemPackage(app,id);if(!candidate)return;
 const installed=app.store.get('skill_installations',candidate.id);
 const pkg:SkillPackage=installed?.packageSnapshot?.id===candidate.id&&installed.packageSnapshot.digest===installed.version?installed.packageSnapshot:candidate;
 if(!resource||resource.includes('\\')||resource.includes('\0')||resource.startsWith('/')||resource.includes(':'))throw Error('Invalid skill resource path');
 if(pkg.files.some(f=>f.path===resource))return (await readPackageFile(app,pkg,resource)).toString('utf8');
 // Sibling resources are resolved through declared package manifests, never raw ../ filesystem reads.
 const target=posix.normalize(posix.join(posix.dirname(pkg.sourcePath),resource));
 const manifest=await ecosystemManifest(app.root);
 for(const other of manifest?.packages??[]){if(other.repository!==pkg.repository||other.revision!==pkg.revision||other.license.decision!=='allowed')continue;const file=other.files.find(f=>f.sourcePath===target);if(file){const install=app.store.get('skill_installations',other.id);if(!(install?.installed??other.defaultInstalled)||install?.enabled===false)throw Error('Linked skill must be installed and enabled first: '+other.id);return {linkedSkillId:other.id,path:file.path};}}
 throw Error('Resource is outside this package’s reviewed resource map');
}
