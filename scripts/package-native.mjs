import {readFile,writeFile,mkdir,mkdtemp,cp,readdir,lstat,stat} from 'node:fs/promises';
import {join,resolve,basename,dirname,relative} from 'node:path';
import {spawn} from 'node:child_process';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';

const root=process.cwd(),platform=process.platform,arch=process.arch;
if(!['win32','darwin','linux'].includes(platform))throw new Error('Unsupported desktop platform');
if(!['x64','arm64'].includes(arch))throw new Error('Unsupported desktop architecture');
const run=(command,args,options={})=>new Promise((ok,fail)=>{const child=spawn(command,args,{cwd:root,stdio:'inherit',windowsHide:true,...options});child.once('error',fail);child.once('exit',code=>code===0?ok():fail(new Error(command+' failed ('+code+')')));});
const cli=resolve('node_modules/@tauri-apps/cli/tauri.js'),npm=process.env.npm_execpath??join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
await run(process.execPath,[cli,'icon',resolve('src-tauri/icons/source.svg'),'--output',resolve('src-tauri/icons')]);
await run(process.execPath,[npm,'run','build:desktop']);await run(process.execPath,[npm,'run','build']);await run(process.execPath,[npm,'run','build:engine']);
await mkdir('.local',{recursive:true});const stage=await mkdtemp(resolve('.local/native-payload-')),backend=join(stage,'backend');await mkdir(backend,{recursive:true});
const privatePart=/^(?:\.local|\.git|\.rea|tests?|test-results|source-packs|__pycache__|\.env(?:\..*)?|Cookies|Login Data|Web Data|History)$/i;
const filter=source=>{const parts=relative(root,source).split(/[\\/]/);return !parts.some(p=>privatePart.test(p))&&!/\.(?:gguf|safetensors|sqlite(?:-wal|-shm)?|pyc|pem|pfx|p12)$/i.test(source);};
for(const path of ['runtime','dist','dist-desktop'])await cp(resolve(path),join(backend,path),{recursive:true,filter});
await mkdir(join(backend,'skills'),{recursive:true});for(const path of ['built-in','app-research','catalog.json','repository-catalog.json','official-plugin-catalog.json'])await cp(resolve('skills',path),join(backend,'skills',path),{recursive:true,filter});
await mkdir(join(backend,'engine/licenses'),{recursive:true});const engineName='openclaude-engine'+(platform==='win32'?'.exe':'');await cp(resolve('.local/components/agent-backend',engineName),join(backend,'engine',engineName));
await cp(resolve('vendor/AionCore/LICENSE'),join(backend,'engine/licenses/AionCore.txt'));await cp(resolve('vendor/aionrs/LICENSE'),join(backend,'engine/licenses/aionrs.txt'));await cp(resolve('vendor/NOTICE'),join(backend,'engine/NOTICE'));await mkdir(join(backend,'vendor'),{recursive:true});await cp(resolve('vendor/upstream-lock.json'),join(backend,'vendor/upstream-lock.json'));
await mkdir(join(backend,'node'),{recursive:true});await cp(process.execPath,join(backend,'node',platform==='win32'?'node.exe':'node'));
const pkg=JSON.parse(await readFile('package.json','utf8'));delete pkg.workspaces;pkg.scripts={};await writeFile(join(backend,'package.json'),JSON.stringify(pkg,null,2));await cp('package-lock.json',join(backend,'package-lock.json'));
await run(process.execPath,[npm,'ci','--omit=dev','--ignore-scripts','--workspaces=false','--no-audit'],{cwd:backend});
await build({entryPoints:['server/desktop.ts'],bundle:true,packages:'external',platform:'node',target:'node22',format:'esm',outfile:join(backend,'server.mjs'),sourcemap:false});
if(process.env.OPENCLAUDE_PYTHON_ROOT){const python=resolve(process.env.OPENCLAUDE_PYTHON_ROOT);await cp(python,join(backend,'python'),{recursive:true,dereference:true,filter:source=>!/[\\/]__pycache__[\\/]|\.pyc$/.test(source)});const executable=join(backend,'python',platform==='win32'?'python.exe':'bin/python3');await stat(executable);}else throw new Error('Set OPENCLAUDE_PYTHON_ROOT to a clean, redistributable standalone Python runtime for this platform. System/user Python directories are not bundled implicitly.');
await cp('LICENSE',join(stage,'LICENSE'));await cp('THIRD_PARTY_NOTICES.md',join(stage,'THIRD_PARTY_NOTICES.md'));
const files=[];async function inventory(folder){for(const name of await readdir(folder)){const path=join(folder,name),entry=await lstat(path);if(entry.isSymbolicLink()){const actual=await (await import('node:fs/promises')).realpath(path);const delta=relative(stage,actual);if(delta.startsWith('..')||resolve(actual)===resolve(stage))throw new Error('Dependency symlink escapes payload: '+path);const bytes=await readFile(path);files.push({path:relative(stage,path).replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});continue;}if(entry.isDirectory())await inventory(path);else if(entry.isFile()){const bytes=await readFile(path);files.push({path:relative(stage,path).replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}}}
await inventory(stage);await writeFile(join(backend,'runtime-manifest.json'),JSON.stringify({schemaVersion:1,version:pkg.version,platform,arch,contractVersion:1,files,verification:'Packaging does not establish runtime validation or verified publisher identity'},null,2));
const targets=platform==='win32'?['nsis']:platform==='darwin'?['app','dmg']:['deb','appimage'];
const config={bundle:{active:true,targets,icon:[resolve('src-tauri/icons/32x32.png'),resolve('src-tauri/icons/128x128.png'),resolve('src-tauri/icons/128x128@2x.png'),resolve('src-tauri/icons/icon.icns'),resolve('src-tauri/icons/icon.ico')],resources:{[backend+'/']:'backend/',[resolve('LICENSE')]:'LICENSE',[resolve('THIRD_PARTY_NOTICES.md')]:'THIRD_PARTY_NOTICES.md'}}};
if(platform==='darwin')config.bundle.macOS={minimumSystemVersion:'14.0',signingIdentity:'-',hardenedRuntime:false};
if(platform==='linux')config.bundle.linux={deb:{depends:['libgbm1','libxkbcommon0','libxcb-randr0','libpipewire-0.3-0t64 | libpipewire-0.3-0']}};
if(platform==='win32'&&(process.env.OPENCLAUDE_SIGN_CERT_SHA1||process.env.OPENCLAUDE_SIGN_DLIB))config.bundle.windows={allowDowngrades:false,digestAlgorithm:'sha256',signCommand:{cmd:'powershell.exe',args:['-NoProfile','-NonInteractive','-File',resolve('scripts/release/Sign-Release.ps1'),'-Path','%1']}};

const configFile=join(stage,'bundle.json');await writeFile(configFile,JSON.stringify(config));await run(process.execPath,[cli,'build','--ci','--config',configFile,'--','--locked'],{env:{...process.env,OPENCLAUDE_EDITION:'desktop'}});
const zip=new JSZip();for(const file of files){const mode=(await stat(join(stage,file.path))).mode;zip.file(file.path,await readFile(join(stage,file.path)),{unixPermissions:mode});}zip.file('backend/runtime-manifest.json',await readFile(join(backend,'runtime-manifest.json')));
// Installer binaries are emitted by Tauri; portable archives include the native executable or app bundle.
const targetRoot=resolve(process.env.CARGO_TARGET_DIR??'src-tauri/target','release');
if(platform==='darwin'){
 const apps=(await readdir(join(targetRoot,'bundle/macos'))).filter(name=>name.endsWith('.app'));
 if(apps.length!==1)throw new Error('Expected one macOS app bundle');
 // ditto preserves the app bundle's resource layout and executable metadata.
 await mkdir('release',{recursive:true});
 await run('/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',join(targetRoot,'bundle/macos',apps[0]),resolve('release',`Horizon-${pkg.version}-${platform}-${arch}.zip`)]);
}else{
 zip.file(platform==='win32'?'Horizon.exe':'Horizon',await readFile(join(targetRoot,'claude-local-desktop'+(platform==='win32'?'.exe':''))),{unixPermissions:0o755});
 if(platform==='win32'){try{zip.file('WebView2Loader.dll',await readFile(join(targetRoot,'WebView2Loader.dll')));}catch(error){if(error.code!=='ENOENT')throw error;}}
 if(platform==='linux'){
  zip.file('Start-Horizon.sh','#!/bin/sh\nset -eu\ncd -- "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nif ldd ./Horizon 2>&1 | grep -q "not found"; then\n  echo "Missing desktop libraries. Install the Horizon .deb with apt, or install libwebkit2gtk-4.1-0 libayatana-appindicator3-1 libgbm1 libxkbcommon0 libxcb-randr0 libpipewire-0.3-0." >&2\n  ldd ./Horizon | grep "not found" >&2\n  exit 1\nfi\nexec ./Horizon "$@"\n',{unixPermissions:0o755});
 }
}

await mkdir('release',{recursive:true});const archive=resolve('release',`Horizon-${pkg.version}-${platform}-${arch}.zip`);if(platform!=='darwin')await writeFile(archive,await zip.generateAsync({type:'nodebuffer',platform:'UNIX',compression:'DEFLATE',compressionOptions:{level:6}}));await writeFile(archive+'.sha256',createHash('sha256').update(await readFile(archive)).digest('hex')+'  '+basename(archive)+'\n');
