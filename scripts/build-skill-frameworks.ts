import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {sourceArchive} from './skill-source-archive.ts';
const base=resolve(process.argv[2]??'.local/upstream-skill-review');
const review=JSON.parse(await readFile(join(base,'summary.json'),'utf8'));
const aas=review.find((s:any)=>s.source==='agentic-awesome-skills');
const original=await sourceArchive(base,aas.source,aas.sha);
const sourceRoot=join(base,'.core-build',aas.sha),output=resolve('skills/ecosystem/engine');
const files=original.entries.filter(e=>e.name.startsWith('tools/lib/aas-v1/')||e.name.startsWith('schemas/aas-v1/'));
// Preserve the static relative-module closure without copying unrelated repository applications/tests.
for(let i=0;i<files.length;i++){const entry=files[i];if(!entry.name.endsWith('.js'))continue;const text=await original.text(entry.name);for(const match of text.matchAll(/require\(["'](\.[^"']+)["']\)/g)){const at=resolve('/',dirname(entry.name),match[1]).replaceAll('\\','/').replace(/^\w:\//,'').replace(/^\//,'');const target=[at,at+'.js',at+'/index.js',at+'.json'].map(name=>original.entries.find(e=>e.name===name)).find(Boolean);if(target&&!files.some(f=>f.name===target.name))files.push(target);}}
const provenance:{path:string;sha256:string;gitBlobSha1?:string}[]=[];
for(const entry of files){const data=await original.bytes(entry.name),target=join(sourceRoot,entry.name);await mkdir(dirname(target),{recursive:true});await writeFile(target,data);provenance.push({path:entry.name,sha256:createHash('sha256').update(data).digest('hex'),gitBlobSha1:original.blobs.get(entry.name)});if(!entry.name.endsWith('.js')){const dest=join(output,entry.name);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,data);}}
await mkdir(output,{recursive:true});
await build({entryPoints:files.filter(f=>f.name.endsWith('.js')).map(f=>join(sourceRoot,f.name)),outbase:sourceRoot,outdir:output,platform:'node',target:'node22',format:'cjs',bundle:true,external:['node:*'],plugins:[{name:'retain-upstream-module-layout',setup(builder){builder.onResolve({filter:/^\.{1,2}(?:\/|$)/},args=>args.importer.startsWith(sourceRoot)?{path:args.path,external:true}:undefined);}}],nodePaths:[resolve('node_modules')],logLevel:'silent'});
await writeFile(join(output,'package.json'),await original.bytes('package.json'));
await writeFile(join(output,'LICENSE'),await original.bytes('LICENSE'));
await writeFile('third-party/skills/aas-core-files.json',JSON.stringify({repository:'sickn33/agentic-awesome-skills',revision:aas.sha,license:'MIT (tooling only)',sourceFilesUnmodified:true,output:'skills/ecosystem/engine',transform:'CommonJS build with external dependencies bundled; module paths and schemas retained',files:provenance},null,2)+'\n');
const ecc=review.find((s:any)=>s.source==='ECC'),eccSource=await sourceArchive(base,ecc.source,ecc.sha);const components:any[]=[];
for(const entry of eccSource.entries.filter(e=>/^(agents|commands)\/[^/]+\.md$/.test(e.name)||/^rules\/.+\.md$/.test(e.name)||entryRequiredForHooks(e.name))){const data=await eccSource.bytes(entry.name);const file='skills/ecosystem/frameworks/ecc/'+entry.name;await mkdir(dirname(file),{recursive:true});await writeFile(file,data);components.push({id:'github:affaan-m/ecc:'+entry.name,name:entry.name.split('/').at(-1)!.replace(/\.md$/,''),kind:entry.name.split('/')[0],path:entry.name,sha256:createHash('sha256').update(data).digest('hex'),gitBlobSha1:eccSource.blobs.get(entry.name),bytes:data.length});}
await writeFile('skills/ecosystem/frameworks/ecc/LICENSE',await eccSource.bytes('LICENSE'));
await writeFile('skills/ecosystem/frameworks/ecc/components.json',JSON.stringify({version:1,repository:'affaan-m/ECC',revision:ecc.sha,components},null,2)+'\n');
for(const path of ['data/workflows.json','data/bundles.json','skills_index.json']){const target=join('skills/ecosystem/frameworks/aas',path);await mkdir(dirname(target),{recursive:true});await writeFile(target,await original.bytes(path));}
await writeFile('skills/ecosystem/frameworks/aas/LICENSE',await original.bytes('LICENSE'));
await writeFile('skills/ecosystem/frameworks/aas/LICENSE-CONTENT',await original.bytes('LICENSE-CONTENT'));
if(original.entries.some(e=>e.name==='docs/sources/sources.md'))await writeFile('skills/ecosystem/frameworks/aas/UPSTREAM-SOURCES.md',await original.bytes('docs/sources/sources.md'));
console.log(JSON.stringify({engineFiles:files.length,eccAgents:components.filter(c=>c.kind==='agents').length,eccCommands:components.filter(c=>c.kind==='commands').length,eccRules:components.filter(c=>c.kind==='rules').length,hooks:'original definitions retained; execution requires Horizon policy review'}));
function entryRequiredForHooks(path:string){return path==='hooks/hooks.json'||/^(scripts\/(hooks|lib)\/|hooks\/memory-persistence\/)/.test(path)&&!/(^|\/)(tests?|fixtures|node_modules)(\/|$)/.test(path);}
