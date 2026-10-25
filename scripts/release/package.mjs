import {createReleaseStage,releaseFiles} from './payload.mjs';
import {releaseTarget} from './build-paths.mjs';
import {writeUpdateManifest} from './update-manifest.mjs';
import {signingConfig,signRelease} from './signing.mjs';
import {build} from 'esbuild';
import {mkdir,cp,readFile,writeFile,readdir,stat,access} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import JSZip from 'jszip';
const root=process.cwd(),version=JSON.parse(await readFile('package.json','utf8')).version;
const signing=signingConfig(process.env,process.argv.includes('--unsigned'));
const out=resolve(process.env.OPENCLAUDE_RELEASE_DIR??'release'),stage=await createReleaseStage(out);
const cache=resolve('.local/release-cache');await mkdir(cache,{recursive:true});await mkdir(stage,{recursive:true});
const target=releaseTarget(root);await mkdir(target,{recursive:true});
const backend=join(stage,'backend');await mkdir(backend,{recursive:true});
const inputs=JSON.parse(await readFile('scripts/release/inputs.json','utf8'));
async function run(command,args,options={}){await new Promise((ok,fail)=>{const child=spawn(command,args,{stdio:'inherit',windowsHide:true,...options});child.on('error',fail);child.on('exit',code=>code===0?ok():fail(new Error(command+' exited '+code)));});}
if(signing.mode!=='unsigned')await run('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-File',resolve('scripts/release/Sign-Release.ps1'),'-CheckOnly']);
else console.warn('UNSIGNED PREVIEW: these packages do not establish an authenticated Horizon publisher.');
const npm=process.env.npm_execpath??join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
async function download(item,name){const file=join(cache,name);let bytes;try{bytes=await readFile(file);}catch{}if(!bytes||createHash('sha256').update(bytes).digest('hex')!==item.sha256){const response=await fetch(item.url);if(!response.ok)throw new Error('Download failed '+response.status+': '+item.url);bytes=Buffer.from(await response.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw new Error('Release dependency checksum mismatch: '+name);await writeFile(file,bytes);}return file;}
if(!process.argv.includes('--skip-build')){
 await run(process.execPath,[npm,'run','build:engine']);await run(process.execPath,[npm,'run','build']);await run(process.execPath,[npm,'run','build:desktop']);
 const nativeBuild=join(process.env.PUBLIC??'C:/Users/Public','HorizonReleaseBuild-'+version);await mkdir(join(nativeBuild,'src-tauri'),{recursive:true});
 for(const file of ['src','capabilities','permissions','icons','Cargo.toml','Cargo.lock','build.rs','tauri.conf.json'])await cp(join(root,'src-tauri',file),join(nativeBuild,'src-tauri',file),{recursive:true});
 await cp(join(root,'dist-desktop'),join(nativeBuild,'dist-desktop'),{recursive:true});
 // These page adapters are compile-time include_str! inputs, not just backend assets.
 await mkdir(join(nativeBuild,'runtime/worker'),{recursive:true});
 for(const file of ['page-diagnostics.js','page-advanced.js'])await cp(join(root,'runtime/worker',file),join(nativeBuild,'runtime/worker',file));
 const flags=[...(process.env.CARGO_ENCODED_RUSTFLAGS?.split('\x1f')??[]),'--remap-path-prefix='+homedir()+'=/build'].join('\x1f');
 await run('cargo',['build','--release','--manifest-path',join(nativeBuild,'src-tauri/Cargo.toml')],{env:{...process.env,CARGO_ENCODED_RUSTFLAGS:flags,CARGO_TARGET_DIR:target}});
}
await cp(join(target,'release/claude-local-desktop.exe'),join(stage,'Horizon.exe'));await cp(join(target,'release/WebView2Loader.dll'),join(stage,'WebView2Loader.dll'));
await mkdir(join(backend,'node'),{recursive:true});await cp(process.execPath,join(backend,'node/node.exe'));
await cp(join(dirname(process.execPath),'LICENSE'),join(backend,'node/LICENSE'));
await mkdir(join(backend,'engine'),{recursive:true});await cp(join(root,'.local/components/agent-backend'),join(backend,'engine'),{recursive:true});await mkdir(join(backend,'vendor'),{recursive:true});await cp(join(root,'vendor/upstream-lock.json'),join(backend,'vendor/upstream-lock.json'));
const result=await build({entryPoints:['server/desktop.ts'],bundle:true,packages:'external',platform:'node',target:'node22',format:'esm',outfile:join(backend,'server.mjs'),metafile:true,sourcemap:false});
await build({entryPoints:['scripts/release/setup-runtime.ts'],bundle:true,packages:'external',platform:'node',target:'node22',format:'esm',outfile:join(backend,'setup-runtime.mjs'),sourcemap:false});
const pkg=JSON.parse(await readFile('package.json','utf8')),dependencies={};
const externalPackages=Object.values(result.metafile.outputs).flatMap(output=>output.imports.filter(item=>item.external&&!item.path.startsWith('node:')&&!item.path.startsWith('.')).map(item=>item.path.split('/').slice(0,item.path.startsWith('@')?2:1).join('/')));
for(const name of new Set(externalPackages)){
 if(!(name in pkg.dependencies))continue;
 dependencies[name]=JSON.parse(await readFile(join(root,'node_modules',name,'package.json'),'utf8')).version;
}
await writeFile(join(backend,'package.json'),JSON.stringify({name:'horizon-desktop-backend',version,private:true,type:'module',license:'MIT',dependencies},null,2)+'\n');
await run(process.execPath,[npm,'install','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:backend});
for(const path of ['runtime','dist','dist-desktop'])await cp(path,join(backend,path),{recursive:true,filter:path=>!/(?:__pycache__|\.pyc$|train_lora\.py$|train_qlora\.py$|qlora\.py$)/.test(path)});
await mkdir(join(backend,'skills'),{recursive:true});
for(const path of ['built-in','app-research','repository-catalog.json','official-plugin-catalog.json'])await cp(join(root,'skills',path),join(backend,'skills',path),{recursive:true});
const catalog=JSON.parse(await readFile('skills/catalog.json','utf8'));const skills=[];for(const item of catalog.skills.filter(item=>/^built-in\/|^app-research\//.test(item.bundledEntry??''))){const text=await readFile(join('skills',item.bundledEntry));skills.push({id:item.id,name:item.name,description:item.description,sourceFamily:'Horizon',builtIn:true,bundledEntry:item.bundledEntry,requirements:[],sha256:createHash('sha256').update(text).digest('hex')});}
await writeFile(join(backend,'skills/catalog.json'),JSON.stringify({schemaVersion:1,packs:[],skills},null,2));
const python=await download(inputs.python,'python.tar.gz');await run('tar',['-xzf',python,'-C',backend]);await access(join(backend,'python/python.exe'));
const licenses=join(backend,'licenses');await mkdir(join(licenses,'npm'),{recursive:true});const inventory=[];
const lock=JSON.parse(await readFile('package-lock.json','utf8'));
for(const [path,metadata] of Object.entries(lock.packages)){
 if(!path.startsWith('node_modules/'))continue;let entries;try{entries=await readdir(path);}catch{continue;}
 const packageData=JSON.parse(await readFile(join(path,'package.json'),'utf8'));const name=packageData.name??path.split('node_modules/').at(-1);const id=(name+'-'+metadata.version).replaceAll('/','__');
 inventory.push({name,version:metadata.version,license:metadata.license??packageData.license,source:packageData.repository?.url??packageData.homepage??null});
 for(const file of entries.filter(name=>/^(?:licen[cs]e|copying|notice|ofl)(?:\.|$|-)/i.test(name))){if((await stat(join(path,file))).isFile()){await mkdir(join(licenses,'npm',id),{recursive:true});await cp(join(path,file),join(licenses,'npm',id,file));}}
}
await writeFile(join(licenses,'npm-inventory.json'),JSON.stringify(inventory,null,2)+'\n');
const rustHost=execFileSync('rustc',['-vV'],{encoding:'utf8',windowsHide:true}).match(/^host: (.+)$/m)?.[1]?.trim();
if(!rustHost)throw new Error('Cannot determine the compiled Windows Rust target');
const rust=JSON.parse(execFileSync('cargo',['metadata','--manifest-path','src-tauri/Cargo.toml','--format-version','1','--locked','--offline','--filter-platform',rustHost],{encoding:'utf8',maxBuffer:32*1024*1024,windowsHide:true}));
const rustInventory=[];
const crateCache=join(process.env.CARGO_HOME??join(homedir(),'.cargo'),'registry/cache');
for(const item of rust.packages.filter(item=>item.source)){
 const folder=dirname(item.manifest_path),id=item.name+'-'+item.version;rustInventory.push({name:item.name,version:item.version,license:item.license,source:item.repository??item.source});
 const files=await readdir(folder);for(const file of files.filter(name=>/^(?:licen[cs]e|copying|notice|copyright)(?:\.|$|-)/i.test(name))){await mkdir(join(licenses,'rust',id),{recursive:true});await cp(join(folder,file),join(licenses,'rust',id,file),{recursive:true});}
 if(item.license==='MPL-2.0'){
  let found=false;for(const registry of await readdir(crateCache)){const archive=join(crateCache,registry,id+'.crate');try{await access(archive);}catch{continue;}await mkdir(join(licenses,'sources'),{recursive:true});await cp(archive,join(licenses,'sources',id+'.crate'));found=true;break;}if(!found)throw new Error('Corresponding MPL source archive missing: '+id);
 }
}
await writeFile(join(licenses,'rust-inventory.json'),JSON.stringify(rustInventory,null,2)+'\n');
for(const [name,url] of [['elkjs-0.9.3.tar.gz','https://codeload.github.com/kieler/elkjs/tar.gz/refs/tags/0.9.3'],['elk-0.9.1.tar.gz','https://codeload.github.com/eclipse-elk/elk/tar.gz/refs/tags/v0.9.1'],['elk-port-placement-fix.tar.gz','https://codeload.github.com/eclipse-elk/elk/tar.gz/7ca51784e42a24201f29bc13e458728b6fc61cdc']]){
 const response=await fetch(url);if(!response.ok)throw new Error('Corresponding source download failed: '+url);await mkdir(join(licenses,'sources'),{recursive:true});await writeFile(join(licenses,'sources',name),Buffer.from(await response.arrayBuffer()));
}
await writeFile(join(licenses,'sources/README.txt'),'Unmodified ELK/elkjs corresponding sources and license/build files.\nELKJS 0.9.3: https://github.com/kieler/elkjs/releases/tag/0.9.3 (based on ELK 0.9.1 plus eclipse-elk/elk PR 955, whose merged source is also included).\nELK 0.9.1: https://github.com/eclipse-elk/elk/tree/v0.9.1\nHorizon does not modify these dependencies. EPL-covered source remains under EPL, not MIT.\n');
for(const file of ['LICENSE','THIRD_PARTY_NOTICES.md'])await cp(file,join(stage,file));
await cp('installer/Setup-Dependencies.ps1',join(stage,'Setup-Dependencies.ps1'));
await writeFile(join(stage,'Setup-Dependencies.cmd'),'@echo off\r\npowershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup-Dependencies.ps1" -BrowserRuntime -Documents\r\npause\r\n');
await writeFile(join(backend,'runtime-manifest.json'),JSON.stringify({version,node:process.version,python:inputs.python,transport:'private-stdio',modelsBundled:false},null,2)+'\n');
const nsisZip=await download(inputs.nsis,'nsis.zip'),nsisDir=join(cache,'nsis');await mkdir(nsisDir,{recursive:true});
const nsis=await JSZip.loadAsync(await readFile(nsisZip));for(const entry of Object.values(nsis.files)){if(entry.dir)continue;if(entry.name.includes('..')||entry.name.startsWith('/'))throw new Error('Unsafe NSIS archive');const file=join(nsisDir,entry.name);await mkdir(dirname(file),{recursive:true});await writeFile(file,await entry.async('nodebuffer'));}
const makensis=join(nsisDir,'nsis-3.11/makensis.exe');await access(makensis);
await cp('README.md',join(stage,'README.md'));
const payload=await releaseFiles(stage);
await signRelease(join(stage,'Horizon.exe'),signing);
await signRelease(join(stage,'Setup-Dependencies.ps1'),signing);
const installer=join(out,'Horizon-'+version+'-windows-x64-setup.exe');
const signingDefines=signing.mode==='unsigned'?[]:['/DSIGN_SCRIPT='+resolve('scripts/release/Sign-Release.ps1')];
await run(makensis,['/V2','/DSTAGE='+stage,'/DOUTFILE='+installer,'/DVERSION='+version,...signingDefines,resolve('installer/Horizon.nsi')]);
await signRelease(installer,signing);
const zip=new JSZip();for(const path of payload)zip.file('Horizon/'+path,await readFile(join(stage,path)));
const portable=join(out,'Horizon-'+version+'-windows-x64-portable.zip');await writeFile(portable,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6},streamFiles:true}));
let checksums='';for(const file of [installer,portable])checksums+=createHash('sha256').update(await readFile(file)).digest('hex')+'  '+file.slice(out.length+1)+'\n';await writeFile(join(out,'SHA256SUMS.txt'),checksums);
console.log(JSON.stringify({stage,installer,portable,checksums:join(out,'SHA256SUMS.txt')}));
await writeUpdateManifest(out,version);
