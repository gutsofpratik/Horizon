import {readFile,writeFile,mkdir,mkdtemp,cp,readdir,lstat,stat} from 'node:fs/promises';
import {join,resolve,basename,dirname,relative} from 'node:path';
import {spawn} from 'node:child_process';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';

const root=process.cwd(),platform=process.platform,arch=process.arch;
if(platform!=='win32')throw new Error('Native desktop packaging is currently disabled outside Windows');
if(!['x64','arm64'].includes(arch))throw new Error('Unsupported Windows architecture');
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
if(process.env.OPENCLAUDE_PYTHON_ROOT){const python=resolve(process.env.OPENCLAUDE_PYTHON_ROOT);await cp(python,join(backend,'python'),{recursive:true,filter:source=>!/[\\/]__pycache__[\\/]|\.pyc$/.test(source)});const executable=join(backend,'python',platform==='win32'?'python.exe':'bin/python3');await stat(executable);}else throw new Error('Set OPENCLAUDE_PYTHON_ROOT to a clean, redistributable standalone Python runtime for this platform. System/user Python directories are not bundled implicitly.');
await cp('LICENSE',join(stage,'LICENSE'));await cp('THIRD_PARTY_NOTICES.md',join(stage,'THIRD_PARTY_NOTICES.md'));
const files=[];async function inventory(folder){for(const name of await readdir(folder)){const path=join(folder,name),entry=await lstat(path);if(entry.isSymbolicLink())throw new Error('Native payload contains a symbolic link; provide a standalone dependency payload: '+path);if(entry.isDirectory())await inventory(path);else if(entry.isFile()){const bytes=await readFile(path);files.push({path:relative(stage,path).replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}}}
await inventory(stage);await writeFile(join(backend,'runtime-manifest.json'),JSON.stringify({schemaVersion:1,version:pkg.version,platform,arch,contractVersion:1,files,verification:'Packaging does not establish runtime validation or verified publisher identity'},null,2));
const targets=['nsis'];
const config={bundle:{active:true,targets,icon:[resolve('src-tauri/icons/32x32.png'),resolve('src-tauri/icons/128x128.png'),resolve('src-tauri/icons/128x128@2x.png'),resolve('src-tauri/icons/icon.icns'),resolve('src-tauri/icons/icon.ico')],resources:{[backend+'/']:'backend/',[resolve('LICENSE')]:'LICENSE',[resolve('THIRD_PARTY_NOTICES.md')]:'THIRD_PARTY_NOTICES.md'}}};
if(platform==='win32'&&(process.env.OPENCLAUDE_SIGN_CERT_SHA1||process.env.OPENCLAUDE_SIGN_DLIB))config.bundle.windows={allowDowngrades:false,digestAlgorithm:'sha256',signCommand:{cmd:'powershell.exe',args:['-NoProfile','-NonInteractive','-File',resolve('scripts/release/Sign-Release.ps1'),'-Path','%1']}};

const configFile=join(stage,'bundle.json');await writeFile(configFile,JSON.stringify(config));await run(process.execPath,[cli,'build','--config',configFile,'--locked'],{env:{...process.env,OPENCLAUDE_EDITION:'desktop'}});
const zip=new JSZip();for(const file of files){const mode=(await stat(join(stage,file.path))).mode;zip.file(file.path,await readFile(join(stage,file.path)),{unixPermissions:mode});}zip.file('backend/runtime-manifest.json',await readFile(join(backend,'runtime-manifest.json')));
// Installer binaries are emitted by Tauri; portable archives include the native executable or app bundle.
const native='claude-local-desktop.exe';zip.file('Horizon.exe',await readFile(resolve('src-tauri/target/release',native)),{unixPermissions:0o755});

await mkdir('release',{recursive:true});const archive=resolve('release',`Horizon-${pkg.version}-${platform}-${arch}.zip`);await writeFile(archive,await zip.generateAsync({type:'nodebuffer',platform:'UNIX',compression:'DEFLATE',compressionOptions:{level:6}}));await writeFile(archive+'.sha256',createHash('sha256').update(await readFile(archive)).digest('hex')+'  '+basename(archive)+'\n');
