import {readFile,writeFile,mkdir,readdir,copyFile,stat} from 'node:fs/promises';
import {join,dirname,posix,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {parseFrontmatter} from '../server/skills/ecosystem/upstream/frontmatter.ts';
import {classifyLicense} from '../server/skills/ecosystem/licenses.ts';
import {canonicalPackageId} from '../server/skills/ecosystem/sources.ts';
import type {SkillPackage,EcosystemManifest} from '../server/skills/ecosystem/types.ts';
import {assessSkillCompatibility} from '../server/skills/ecosystem/compatibility.ts';
import {sourceArchive} from './skill-source-archive.ts';
const base=resolve(process.argv[2]??'.local/upstream-skill-review'),output=resolve('skills/ecosystem');
const sha=(bytes:string|Buffer)=>createHash('sha256').update(bytes).digest('hex');
const snapshot=JSON.parse(await readFile(join(base,'summary.json'),'utf8'));
const decisions=JSON.parse(await readFile('docs/superpowers/plans/2026-10-29-horizon-upstream-skills-sources.json','utf8'));
const core=new Set(['codebase-onboarding','frontend-design-direction','frontend-patterns','python-patterns','research-ops','git-workflow','verification-loop','skill-host-compat']);
const category=(name:string)=>/brainstorm|planning|writing-plans|executing-plans|systematic-debug|verification-before|test-driven|using-superpowers/.test(name)?'Superpowers':/frontend|design|artifact|canvas|theme/.test(name)?'Design':/research|search|news/.test(name)?'Research':/browser|computer|webapp-test/.test(name)?'Browser and computer':/speech|voice|audio|dubbing|music|tts/.test(name)?'Voice and audio':/remotion|video|caption/.test(name)?'Video':/xlsx|spreadsheet|excel|pptx|slides|docx|pdf|document/.test(name)?'Documents':/skill|mcp|plugin/.test(name)?'Skills and plugins':'Development';
await mkdir(output,{recursive:true});const packages:SkillPackage[]=[],sources:EcosystemManifest['sources']=[];
const readCached=new Map<string,Promise<string>>();const read=(file:string)=>{if(!readCached.has(file))readCached.set(file,readFile(file,'utf8'));return readCached.get(file)!;};
for(const item of snapshot){
 const inventory=JSON.parse(await readFile(join(base,item.source+'.inventory.json'),'utf8'));
 const decision=decisions.sources.find((s:any)=>s.key===item.source);const repo=inventory.remote.replace(/^https:\/\/github.com\//,'').replace(/\.git$/,'');
 const root=join(base,item.source),original=await sourceArchive(base,item.source,item.sha);sources.push({id:item.source,repository:repo,revision:item.sha,name:item.source,roots:item.source==='elevenlabs-skills'?['.']:['skills'],licenseNote:decision.review.license});
 let paths:string[]=inventory.skills.map((s:any)=>s.path);
 if(item.source==='agentic-awesome-skills')paths=(JSON.parse(await readFile(join(root,'skills_index.json'),'utf8')) as any[]).map(s=>s.path+'/SKILL.md');
 else if(item.source==='ECC')paths=paths.filter(p=>/^skills\/[^/]+\/SKILL\.md$/.test(p));
 else if(item.source==='openai-plugins')paths=paths.filter(p=>p.startsWith('plugins/'));
 else if(item.source==='skills-cli')paths=paths.filter(p=>p.startsWith('skills/'));
 else paths=paths.filter(p=>!p.startsWith('.')&&!/template-skill/i.test(p));
 const fileCache=new Map<string,{path:string;sourcePath:string;sha256:string;bytes:number;gitBlobSha1?:string}[]>();
 async function filesAt(directory:string){if(fileCache.has(directory))return fileCache.get(directory)!;const files:{path:string;sourcePath:string;sha256:string;bytes:number;gitBlobSha1?:string}[]=[];
  for(const entry of original.entries.filter(entry=>entry.name.startsWith(directory+'/')&&!/(^|\/)(node_modules|__pycache__)(\/|$)/.test(entry.name))){const data=await original.bytes(entry.name);files.push({path:posix.relative(directory,entry.name),sourcePath:entry.name,sha256:sha(data),bytes:data.length,gitBlobSha1:original.blobs.get(entry.name)});}
  files.sort((a,b)=>a.path.localeCompare(b.path));fileCache.set(directory,files);return files;
 }
 for(const path of paths){
  const raw=await original.text(path);let meta:Record<string,unknown>;try{meta=parseFrontmatter(raw).data;}catch{continue;}
  if(typeof meta.name!=='string'||typeof meta.description!=='string'||(meta.metadata as any)?.internal===true)continue;
  const dir=posix.dirname(path);const files=await filesAt(dir);const ownLicenses=inventory.licenses.filter((p:string)=>p.startsWith(dir+'/'));
  let evidence:string[]=ownLicenses;let texts=await Promise.all(evidence.map(p=>original.text(p)));
  if(!texts.length){let current=posix.dirname(dir);while(true){const candidates=inventory.licenses.filter((p:string)=>posix.dirname(p)===current);if(candidates.length){evidence=candidates;texts=await Promise.all(candidates.map((p:string)=>original.text(p)));break;}if(current==='.')break;current=posix.dirname(current);}}
  let plugin:any;const pluginPath=item.source==='openai-plugins'?path.split('/').slice(0,2).join('/')+'/.codex-plugin/plugin.json':undefined;
  if(pluginPath)try{plugin=JSON.parse(await original.text(pluginPath));}catch{}
  if(!texts.length&&typeof plugin?.license==='string'){texts=[plugin.license];evidence=[pluginPath!];}
  let license=classifyLicense(texts.join('\n'));
  const declaration=typeof meta.license==='string'?classifyLicense(meta.license):undefined;
  if(declaration?.decision==='restricted'||declaration?.decision==='unresolved'&&/GPL|FSL|SA-/i.test(meta.license as string))license=declaration;
  // Source content license takes precedence over tooling license at AAS's root.
  if(item.source==='agentic-awesome-skills'&&evidence.includes('LICENSE-CONTENT')&&license.decision==='allowed')license=classifyLicense(await original.text('LICENSE-CONTENT'));
  const name=String(meta.name),id=canonicalPackageId(repo,path);
  const compatibility=assessSkillCompatibility(meta,raw,item.source);
  const mapped=compatibility.compatibility==='mapped';
  const defaultInstalled=license.decision==='allowed';
  // Keep original package content and only append licenses under a dedicated path.
  for(const [index,sourcePath]of evidence.entries())if(!files.some(f=>f.sourcePath===sourcePath)){const data=await original.bytes(sourcePath);files.push({path:'UPSTREAM-NOTICES/'+index+'-'+posix.basename(sourcePath),sourcePath,sha256:sha(data),bytes:data.length,gitBlobSha1:original.blobs.get(sourcePath)});}
  const pkg:SkillPackage={kind:'skill',id,sourceId:item.source,repository:repo,revision:item.sha,sourcePath:path,name,description:String(meta.description).slice(0,2000),category:item.source==='superpowers'?'Superpowers':category(name),license:{...license,evidence},digest:sha(JSON.stringify(files.map(f=>[f.path,f.sha256]))),files,...compatibility,defaultInstalled,sourceVersion:typeof meta.version==='string'?meta.version:undefined};
  if(plugin)pkg.pluginId='github:'+repo.toLowerCase()+':'+path.split('/').slice(0,2).join('/');
  packages.push(pkg);
  if(defaultInstalled){const dest=join(output,'packages',sha(id));await mkdir(dest,{recursive:true});for(const file of files){const target=join(dest,file.path);await mkdir(dirname(target),{recursive:true});await writeFile(target,await original.bytes(file.sourcePath));}await writeFile(join(dest,'HORIZON-PROVENANCE.json'),JSON.stringify({id,repository:repo,revision:item.sha,digest:pkg.digest,license:pkg.license},null,2)+'\n');}
 }
 if(item.source==='ECC')for(const entry of original.entries.filter(e=>/^commands\/[^/]+\.md$/.test(e.name))){const data=await original.bytes(entry.name),text=data.toString('utf8'),meta=parseFrontmatter(text).data,id='github:affaan-m/ecc:'+entry.name;const license=classifyLicense(await original.text('LICENSE')),notice=await original.bytes('LICENSE');const files=[{path:entry.name,sourcePath:entry.name,sha256:sha(data),bytes:data.length,gitBlobSha1:original.blobs.get(entry.name)},{path:'UPSTREAM-LICENSE.txt',sourcePath:'LICENSE',sha256:sha(notice),bytes:notice.length,gitBlobSha1:original.blobs.get('LICENSE')}];const pkg:SkillPackage={kind:'skill',componentKind:'command',entrypoint:entry.name,id,sourceId:'ECC',repository:repo,revision:item.sha,sourcePath:entry.name,name:'ecc-command-'+posix.basename(entry.name,'.md'),description:typeof meta.description==='string'?meta.description:'ECC '+posix.basename(entry.name,'.md')+' workflow command',category:'Commands',license:{...license,evidence:['LICENSE']},digest:sha(JSON.stringify(files.map(f=>[f.path,f.sha256]))),files,requirements:[],defaultInstalled:license.decision==='allowed',compatibility:'mapped',adapter:'horizon-native-v1'};packages.push(pkg);if(pkg.defaultInstalled){const dest=join(output,'packages',sha(id));for(const file of files){const target=join(dest,file.path);await mkdir(dirname(target),{recursive:true});await writeFile(target,await original.bytes(file.sourcePath));}}}
 console.log(item.source+': '+packages.filter(p=>p.sourceId===item.source).length+' canonical packages');
}
for(const folder of ['documents','pdf','interaction','artifacts']){
 const path='skills/ecosystem/native/'+folder+'/SKILL.md',data=await readFile(path);const meta=parseFrontmatter(data.toString()).data;const id='horizon:adapter:'+folder;
 const pkg:SkillPackage={kind:'skill',id,sourceId:'horizon-native',repository:'',revision:'application',sourcePath:path,name:String(meta.name),description:String(meta.description),category:folder==='interaction'?'Tool bindings':folder==='artifacts'?'Design':'Documents',license:{decision:'allowed',label:'MIT',evidence:['Application LICENSE']},digest:sha(data),files:[{path:'SKILL.md',sourcePath:path,sha256:sha(data),bytes:data.length}],requirements:[],defaultInstalled:true,compatibility:'mapped',adapter:'horizon-native-v1'};
 packages.push(pkg);const dest=join(output,'packages',sha(id));await mkdir(dest,{recursive:true});await writeFile(join(dest,'SKILL.md'),data);
}
// Prefer original sources, and retain provenance for byte-identical mirrors.
const preferred=[...packages].sort((a,b)=>Number(a.sourceId==='agentic-awesome-skills')-Number(b.sourceId==='agentic-awesome-skills'));
const content=new Map<string,string>();for(const pkg of preferred){const main=pkg.files.find(f=>f.path==='SKILL.md')?.sha256;if(main){const original=content.get(main);if(original)pkg.duplicateOf=original;else content.set(main,pkg.id);}}
const plugins:NonNullable<EcosystemManifest['plugins']>=[];
const openai=JSON.parse(await readFile(join(base,'openai-plugins.inventory.json'),'utf8'));
for(const file of openai.manifests.filter((p:string)=>p.startsWith('plugins/')&&p.endsWith('/.codex-plugin/plugin.json'))){
 const raw=JSON.parse(await readFile(join(base,'openai-plugins',file),'utf8')),sourcePath=file.split('/').slice(0,2).join('/'),id='github:openai/plugins:'+sourcePath;
 const skillIds=packages.filter(p=>p.pluginId===id).map(p=>p.id);const components=[{name:'Skills',status:skillIds.length?'available':'not-provided'}];
 for(const [marker,name]of [['.mcp.json','MCP connection'],['.app.json','Host app connection'],['hooks.json','Lifecycle hooks']] as const){try{await stat(join(base,'openai-plugins',sourcePath,marker));components.push({name,status:marker==='.app.json'?'host-integration-required':marker==='hooks.json'?'review-required':'connection-required'});}catch{}}
 plugins.push({id,name:raw.interface?.displayName??raw.name,description:raw.description??'',repository:'openai/plugins',revision:openai.sha,sourcePath,sourceFamily:'OpenAI Plugins',license:classifyLicense(String(raw.license??'')),skillIds,components,manifest:raw});
}
const manifest:EcosystemManifest={version:1,sources,packages,plugins,generatedAt:new Date().toISOString()};
for(const plugin of plugins)if(plugin.components.some(component=>component.name==='Host app connection'))for(const pkg of packages.filter(p=>p.pluginId===plugin.id))pkg.requirements.push({kind:'host',id:'plugin-app:'+plugin.id});
// Readiness/bindings are part of the installation contract, while upstream file
// hashes still attest the unmodified original bytes independently.
for(const pkg of packages){pkg.digest=sha(JSON.stringify({files:pkg.files.map(file=>[file.path,file.sha256]),requirements:pkg.requirements,adapter:pkg.adapter,compatibility:pkg.compatibility,license:pkg.license.decision}));if(pkg.defaultInstalled)await writeFile(join(output,'packages',sha(pkg.id),'HORIZON-PROVENANCE.json'),JSON.stringify({id:pkg.id,repository:pkg.repository,revision:pkg.revision,digest:pkg.digest,license:pkg.license},null,2)+'\n');}
await writeFile(join(output,'catalog.json'),JSON.stringify(manifest)+'\n');
await writeFile(join(output,'sources.lock.json'),JSON.stringify({version:1,sources,packages:packages.map(p=>({id:p.id,revision:p.revision,digest:p.digest}))},null,2)+'\n');
await writeFile('third-party/skills/NOTICE.md','# Horizon skill sources\n\nSource revisions and package-level license decisions are in `skills/ecosystem/sources.lock.json` and `catalog.json`. Bundled packages preserve their original instruction bodies, resources and notices. Root tooling licenses do not replace nested content licenses.\n\nVercel management source: vercel-labs/skills at 92a9a34ac3bf88e695e468b90c7bf32f163d32c8, MIT; selected modules are listed in vercel-skills-files.json.\n');
console.log(JSON.stringify({sources:sources.length,packages:packages.length,bundled:packages.filter(p=>p.defaultInstalled).length,allowed:packages.filter(p=>p.license.decision==='allowed').length}));
