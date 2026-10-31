import {readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import type {EcosystemManifest,SkillPackage} from './types.ts';
import {canonicalAlias} from './relationships.ts';
const cache=new Map<string,{mtime:number;value:EcosystemManifest}>();
export async function ecosystemManifest(root:string):Promise<EcosystemManifest|undefined>{
 const path=join(root,'skills/ecosystem/catalog.json');let info;
 try{info=await stat(path);}catch(error:any){if(error.code==='ENOENT')return;throw error;}
 const saved=cache.get(path);if(saved?.mtime===info.mtimeMs)return saved.value;
 const value=JSON.parse(await readFile(path,'utf8')) as EcosystemManifest;
 if(value.version!==1||!Array.isArray(value.packages)||!Array.isArray(value.sources)||value.packages.length>15000)throw Error('Invalid skill ecosystem manifest');
 const ids=new Set<string>();
 for(const item of value.packages){if(!item.id||ids.has(item.id)||!Array.isArray(item.files)||!Array.isArray(item.requirements)||!['allowed','restricted','unresolved'].includes(item.license?.decision)||!/^[a-f0-9]{64}$/.test(item.digest)||!(/^[a-f0-9]{40}$/.test(item.revision)||item.sourceId==='horizon-native'&&item.revision==='application'))throw Error('Invalid ecosystem package: '+item.id);ids.add(item.id);}
 cache.set(path,{mtime:info.mtimeMs,value});return value;
}
export function resolvePackage(packages:SkillPackage[],id:string){return packages.find(p=>p.id===id)||packages.find(p=>p.id===canonicalAlias(id)||p.aliases?.includes(id));}
export async function ecosystemEnabled(app:{root:string;ephemeral:Map<string,any>;store?:{get:(bucket:string,id:string)=>any}}){const override=app.ephemeral.get('skillEcosystemEnabled');if(typeof override==='boolean')return override;const saved=app.store?.get('settings','main')?.skillEcosystemEnabled;if(typeof saved==='boolean')return saved;if(typeof app.root!=='string')return false;try{const policy=JSON.parse(await readFile(join(app.root,'skills/ecosystem/policy.json'),'utf8'));return policy.enabled===true;}catch(error:any){if(error.code==='ENOENT')return false;throw error;}}
export function canonicalPackageId(repository:string,sourcePath:string){return 'github:'+repository.toLowerCase()+':'+sourcePath.replace(/\\/g,'/').replace(/\/?SKILL\.md$/i,'');}
