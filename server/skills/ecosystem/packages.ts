import {readFile,mkdir,writeFile,rename,rm,lstat} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import type {AppContext} from '../../app.ts';
import type {SkillPackage} from './types.ts';
import {safePath} from '../../tools/files.ts';
const hash=(input:string|Buffer)=>createHash('sha256').update(input).digest('hex');
const pending=new Map<string,Promise<any>>();
export const packageFolder=(root:string,id:string)=>join(root,hash(id));
export function bundledPackageRoot(app:AppContext,pkg:SkillPackage){return packageFolder(join(app.root,'skills/ecosystem/packages'),pkg.id);}
export function installedPackageRoot(app:AppContext,pkg:SkillPackage){const install=app.store.get('skill_installations',pkg.id);if(install?.installed===false)return;if(install?.packageRoot){if(!/^[a-f0-9]{64}$/.test(String(install.version)))throw Error('Invalid installed package revision');const expected=join(packageFolder(join(app.dataDirectory,'skill-packages'),pkg.id),install.version);if(resolve(install.packageRoot)!==resolve(expected))throw Error('Installed package location is outside its owned cache');return expected;}return pkg.defaultInstalled?bundledPackageRoot(app,pkg):undefined;}
export async function boundedSourceFile(pkg:SkillPackage,sourcePath:string,limit:number,signal?:AbortSignal){
 if(!/^[\w.-]+\/[\w.-]+$/.test(pkg.repository)||!/^[a-f0-9]{40}$/.test(pkg.revision)||sourcePath.split('/').some(p=>!p||p==='.'||p==='..'||/[\\\0:]/.test(p)))throw Error('Invalid pinned package source');
 const url='https://raw.githubusercontent.com/'+pkg.repository+'/'+pkg.revision+'/'+sourcePath.split('/').map(encodeURIComponent).join('/');
 const response=await fetch(url,{redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000)});
 if(!response.ok||!response.body)throw Error('Pinned skill resource returned HTTP '+response.status);
 const data:Uint8Array[]=[];let size=0;for await(const chunk of response.body as any){size+=chunk.length;if(size>limit)throw Error('Skill resource exceeds declared size limit');data.push(chunk);}return Buffer.concat(data);
}
export async function installEcosystemPackage(app:AppContext,pkg:SkillPackage,signal?:AbortSignal){
 if(pkg.license.decision!=='allowed')throw Error(pkg.license.reason??'Package license has not been cleared for installation');
 if(pkg.duplicateOf)throw Error('Install the canonical package instead: '+pkg.duplicateOf);
 const key=app.dataDirectory+':'+pkg.id;if(pending.has(key))return pending.get(key);
 const work=(async()=>{
  const previous=app.store.get('skill_installations',pkg.id);
  if(previous?.installed&&previous.version===pkg.digest)return previous;
  if(!pkg.files.length||pkg.files.length>4096||pkg.files.reduce((n,f)=>n+f.bytes,0)>30*1024*1024)throw Error('Selected package exceeds bounded installation limits');
  if(new Set(pkg.files.map(f=>f.path.toLowerCase())).size!==pkg.files.length||pkg.files.some(f=>!f.path||f.path.includes('\\')||/[\0:]/.test(f.path)||f.path.startsWith('/')||f.path.split('/').some(p=>!p||p==='.'||p==='..')||!Number.isSafeInteger(f.bytes)||f.bytes<0||!/^[a-f0-9]{64}$/.test(f.sha256)))throw Error('Unsafe package resource manifest');
  const base=join(app.dataDirectory,'skill-packages');await mkdir(base,{recursive:true});const parent=await safePath(base,hash(pkg.id));await mkdir(parent,{recursive:true});const root=await safePath(base,hash(pkg.id)+'/'+pkg.digest),staging=await safePath(base,hash(pkg.id)+'/.install-'+randomUUID());await mkdir(staging,{recursive:true});
  let created=false;try{
   for(const file of pkg.files){signal?.throwIfAborted();if(file.bytes>10*1024*1024)throw Error('Skill resource is too large');const target=await safePath(staging,file.path);let data:Buffer;
    try{data=await readFile(await safePath(bundledPackageRoot(app,pkg),file.path));}catch(error:any){if(error.code!=='ENOENT')throw error;data=await boundedSourceFile(pkg,file.sourcePath,file.bytes,signal);}
    if(data.length!==file.bytes||hash(data)!==file.sha256)throw Error('Skill package integrity mismatch: '+file.path);
    await mkdir(dirname(target),{recursive:true});await writeFile(target,data);
   }
   await writeFile(join(staging,'HORIZON-PROVENANCE.json'),JSON.stringify({id:pkg.id,repository:pkg.repository,revision:pkg.revision,digest:pkg.digest,license:pkg.license}));
   try{const info=await lstat(root);if(info.isSymbolicLink()||!info.isDirectory())throw Error('Invalid immutable package destination');for(const file of pkg.files)if(hash(await readFile(await safePath(root,file.path)))!==file.sha256)throw Error('Existing immutable package is corrupt');}
   catch(error:any){if(error.code!=='ENOENT')throw error;await rename(staging,root);created=true;}
   const record={...previous,id:pkg.id,installed:true,enabled:previous?.enabled!==false,version:pkg.digest,packageRoot:root,packageSnapshot:pkg,previousVersion:previous?.version,previousSnapshot:previous?.packageSnapshot,revision:pkg.revision,installedAt:new Date().toISOString()};
   try{return app.store.put('skill_installations',record);}catch(error){if(created)await rm(root,{recursive:true,force:true});throw error;}
  }finally{await rm(staging,{recursive:true,force:true});}
 })();pending.set(key,work);try{return await work;}finally{pending.delete(key);}
}
export async function readPackageFile(app:AppContext,pkg:SkillPackage,path:string){
 const file=pkg.files.find(f=>f.path===path);if(!file)throw Error('Resource is not declared by this pinned package');
 const root=installedPackageRoot(app,pkg);if(!root)throw Error('Install this package before reading its resources');
 const data=await readFile(await safePath(root,file.path));if(data.length!==file.bytes||hash(data)!==file.sha256)throw Error('Installed skill resource changed; restore or update this package');return data;
}
