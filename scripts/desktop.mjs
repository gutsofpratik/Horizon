import {spawn} from 'node:child_process';import {join} from 'node:path';import {mkdirSync,copyFileSync,existsSync,statSync} from 'node:fs';
// Native launches use their own runtime and log files, without npm or a console.
if(process.platform==='win32'){const folder=join(process.cwd(),'.local','desktop-runtime');mkdirSync(folder,{recursive:true});const target=join(folder,'node.exe');if(!existsSync(target)||statSync(target).size!==statSync(process.execPath).size||statSync(target).mtimeMs<statSync(process.execPath).mtimeMs)copyFileSync(process.execPath,target);}
let ownedApi;
if((process.argv[2]??'dev')==='dev'){
 const code=await new Promise((resolve,reject)=>{const build=spawn(process.execPath,[join(process.cwd(),'node_modules/vite/bin/vite.js'),'build'],{stdio:'inherit',windowsHide:true,env:{...process.env,OPENCLAUDE_EDITION:'desktop'}});build.on('error',reject);build.on('exit',resolve);});
 if(code!==0)process.exit(Number(code)||1);
 try{const response=await fetch('http://127.0.0.1:3001/api/model-library/runtime',{signal:AbortSignal.timeout(2000)});if(!response.ok)throw new Error('API is not ready');}
 catch{
  ownedApi=spawn(process.execPath,[join(process.cwd(),'node_modules/tsx/dist/cli.mjs'),'server/index.ts'],{stdio:'inherit',windowsHide:true});
  let ready=false;for(let attempt=0;attempt<40;attempt++){try{const response=await fetch('http://127.0.0.1:3001/api/model-library/runtime',{signal:AbortSignal.timeout(1000)});if(response.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,250));}
  if(!ready){ownedApi.kill();throw new Error('OpenClaude desktop API failed to start on port 3001');}
 }
}
process.on('exit',()=>ownedApi?.kill());
const target=join(process.env.LOCALAPPDATA??process.cwd(),'ClaudeLocalBuild','tauri-target');mkdirSync(target,{recursive:true});const env={...process.env,CARGO_TARGET_DIR:target,OPENCLAUDE_WORKSPACE_ROOT:process.cwd()};const action=process.argv[2]??'dev';const command=action==='check'?'cargo':process.execPath;const args=action==='check'?['check','--manifest-path','src-tauri/Cargo.toml']:[join(process.cwd(),'node_modules/@tauri-apps/cli/tauri.js'),action];const child=spawn(command,args,{stdio:'inherit',env});child.on('error',error=>{console.error(error.message);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});

