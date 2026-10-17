import {mkdir,mkdtemp,readdir,lstat} from 'node:fs/promises';
import {join} from 'node:path';
const roots=new Set(['OpenClaude.exe','WebView2Loader.dll','LICENSE','THIRD_PARTY_NOTICES.md','Setup-Dependencies.ps1','Setup-Dependencies.cmd','backend']);
const backendRoots=new Set(['server.mjs','setup-runtime.mjs','node','python','node_modules','package.json','package-lock.json','runtime','skills','dist','dist-desktop','licenses','runtime-manifest.json']);
export async function createReleaseStage(output){await mkdir(output,{recursive:true});return mkdtemp(join(output,'.openclaude-stage-'));}
export async function releaseFiles(stage){
 const files=[];
 async function visit(folder,prefix=''){
  for(const entry of await readdir(folder,{withFileTypes:true})){
   const name=prefix+entry.name,path=join(folder,entry.name),parts=name.split('/');
   if(!roots.has(parts[0])||parts[0]==='backend'&&parts.length>1&&!backendRoots.has(parts[1]))throw new Error('Unexpected release payload: '+name);
   if(parts.some(part=>['.local','.rea','.git','source-packs','.env'].includes(part))||/\.(?:gguf|safetensors|sqlite(?:-wal|-shm)?)$/i.test(name)||/^\.env\./i.test(entry.name)||['Cookies','Login Data','Web Data','History'].includes(entry.name))throw new Error('Private data in release payload: '+name);
   const info=await lstat(path);if(info.isSymbolicLink())throw new Error('Symbolic link in release payload: '+name);
   if(info.isDirectory())await visit(path,name+'/');else if(info.isFile())files.push(name);else throw new Error('Unsupported release payload: '+name);
  }
 }
 await visit(stage);return files.sort();
}
