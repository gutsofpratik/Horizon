import {mkdir,cp,readFile,writeFile,readdir,lstat} from 'node:fs/promises';
import {resolve,join,relative,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(),target=resolve(process.argv[2]??'public-release/Horizon');
if(target===root||!target.startsWith(resolve('public-release')+'/')&&!target.startsWith(resolve('public-release')+'\\'))throw new Error('Export must be inside public-release, separate from the development checkout');
await mkdir(target,{recursive:true});
const ignored=new Set(['node_modules','.git','.local','.rea','.superpowers','test-results','target','gen','__pycache__','vendor','tests','test']);
const obsolete=new Set([/* legacy training artifacts are omitted from binary packages, not silently removed from source */'src/settings/LoraAdapters.tsx','server/models/training-data.ts','server/models/training-data-advanced.ts','runtime/models/train_lora.py','runtime/models/train_qlora.py','runtime/models/qlora.py']);
async function copy(path){await cp(join(root,path),join(target,path),{recursive:true,filter:async file=>{const rel=relative(root,file).replaceAll('\\','/');if(rel.split('/').some(part=>ignored.has(part)||/^\.env(?:\..*)?$/i.test(part)&&part!=='.env.example'))return false;if((await lstat(file)).isSymbolicLink())throw new Error('Symlink excluded: '+rel);return !/\.(?:log|sqlite(?:-wal|-shm)?|pyc|exe|dll|gguf|safetensors|zip|pem|key|pfx|p12)$/i.test(rel);}});}
for(const path of ['src','server','runtime','src-tauri','installer','desktop','packages','third-party','index.html','package.json','package-lock.json','tsconfig.json','vite.config.ts','LICENSE','THIRD_PARTY_NOTICES.md','.dockerignore','.gitattributes'])await copy(path);
await copy('scripts');
await copy('.github/workflows');await copy('docs/inventory');await copy('docs/TOOL_CALLING_GUIDE.md');await copy('docs/superpowers/plans/openclaude-ecosystem-progress.json');await copy('public');
// The public snapshot omits the private verification suite; its workflow runs builds.
const quality=join(target,'.github/workflows/quality.yml');await writeFile(quality,(await readFile(quality,'utf8')).replace(/\n  suites:[\s\S]*?(?=\n  native-source:)/,'').replace('Source quality and contract checks','Source quality and build checks'));
await mkdir(join(target,'docs/images'),{recursive:true});await cp(join(root,'docs/images'),join(target,'docs/images'),{recursive:true});
await cp(join(root,'README.md'),join(target,'README.md'));
await mkdir(join(target,'skills'),{recursive:true});
for(const path of ['skills/built-in','skills/app-research','skills/repository-catalog.json','skills/official-plugin-catalog.json'])await copy(path);
const source=JSON.parse(await readFile(join(root,'skills/catalog.json'),'utf8'));const skills=[];
for(const entry of source.skills.filter(entry=>/^built-in\/|^app-research\//.test(entry.bundledEntry??''))){const text=await readFile(join(root,'skills',entry.bundledEntry));skills.push({id:entry.id,name:entry.name,description:entry.description,sourceFamily:'Horizon',builtIn:true,bundledEntry:entry.bundledEntry,requirements:[],sha256:createHash('sha256').update(text).digest('hex')});}
await writeFile(join(target,'skills/catalog.json'),JSON.stringify({schemaVersion:1,packs:[],skills},null,2)+'\n');
// Publish the original redistributable resources only, with the pinned notices.
// Restricted/unresolved packages remain catalog entries, never copied content.
const ecosystem=JSON.parse(await readFile(join(root,'skills/ecosystem/catalog.json'),'utf8'));
for(const file of ['catalog.json','sources.lock.json','policy.json'])await copy('skills/ecosystem/'+file);
for(const folder of ['engine','frameworks'])await copy('skills/ecosystem/'+folder);
await copy('third-party/skills');
for(const pkg of ecosystem.packages.filter(pkg=>pkg.license.decision==='allowed')){
 const key=createHash('sha256').update(pkg.id).digest('hex'),folder=join(root,'skills/ecosystem/packages',key);
 const copyResource=async(path,expected)=>{const input=resolve(folder,path);if(input!==folder&&!input.startsWith(folder+'/')&&!input.startsWith(folder+'\\'))throw Error('Invalid skill resource path');if((await lstat(input)).isSymbolicLink())throw Error('Skill resource symlink excluded');const bytes=await readFile(input);if(expected&&createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Skill resource hash mismatch');const output=join(target,'skills/ecosystem/packages',key,path);await mkdir(dirname(output),{recursive:true});await writeFile(output,bytes);};
 for(const file of pkg.files)await copyResource(file.path,file.sha256);
 await copyResource('HORIZON-PROVENANCE.json');
 try{await cp(join(folder,'UPSTREAM-NOTICES'),join(target,'skills/ecosystem/packages',key,'UPSTREAM-NOTICES'),{recursive:true});}catch(error){if(error.code!=='ENOENT')throw error;}
}
const pkg=JSON.parse(await readFile(join(target,'package.json'),'utf8'));for(const key of Object.keys(pkg.scripts??{}))if(key==='test'||key.startsWith('test:'))delete pkg.scripts[key];pkg.name='horizon-workspace';pkg.author='Horizon contributors';pkg.license='MIT';pkg.repository={type:'git',url:'https://github.com/gutsofpratik/Horizon.git'};pkg.scripts['release:package']='node scripts/release/package.mjs';pkg.scripts['export:source']='node scripts/release/export-source.mjs';await writeFile(join(target,'package.json'),JSON.stringify(pkg,null,2)+'\n');
const lock=JSON.parse(await readFile(join(target,'package-lock.json'),'utf8'));lock.name='horizon-workspace';lock.packages[''].name='horizon-workspace';lock.packages[''].license='MIT';await writeFile(join(target,'package-lock.json'),JSON.stringify(lock,null,2)+'\n');
const ts=JSON.parse(await readFile(join(target,'tsconfig.json'),'utf8'));ts.include=ts.include?.filter(path=>path!=='tests');await writeFile(join(target,'tsconfig.json'),JSON.stringify(ts,null,2)+'\n');
await writeFile(join(target,'.gitignore'),'node_modules/\n.local/\n.env\n.env.*\n!.env.example\n*.sqlite*\n*.log\n__pycache__/\ndist/\ndist-desktop/\n/release/\n/public-release/\nsrc-tauri/target/\nsrc-tauri/gen/\n.rea/\ntest-results/\n/vendor/\n/tests/\n/test/\n');
const files=[];async function walk(folder){for(const entry of await readdir(folder,{withFileTypes:true})){if(entry.name==='.git')continue;const path=join(folder,entry.name);if(entry.isDirectory())await walk(path);else files.push(relative(target,path).replaceAll('\\','/'));}}await walk(target);
for(const path of files){if(/(?:^|\/)(?:\.local|\.rea|source-packs|\.env(?:\.(?!example$)[^/]*)?)(?:\/|$)|\.(?:sqlite(?:-wal|-shm)?|gguf|safetensors|pem|key|pfx|p12)$/i.test(path))throw new Error('Excluded content found: '+path);}
console.log(JSON.stringify({target,files:files.length,bundledOriginalSkills:skills.map(skill=>skill.id)}));
