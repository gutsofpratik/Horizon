import {ensureEngineSources} from './prepare-engine-sources.mjs';
import {spawn} from 'node:child_process';
import {mkdir,cp,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('..',import.meta.url)),target=process.argv[2],output=join(root,'.local','components',target??'invalid');
const run=(command,args,env={})=>new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,...env}});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Component build failed: '+target+' (exit '+code+')')));});
await mkdir(output,{recursive:true});
if(target==='agent-backend'){
 await ensureEngineSources(root);
 await run('cargo',['build','--locked','--manifest-path',join(root,'vendor/AionCore/Cargo.toml'),'--release','--bin','openclaude-engine','--no-default-features','--features','telegram,lark,dingtalk,slack,discord'],{CARGO_TARGET_DIR:join(root,'.local/engine-target'),CARGO_BUILD_JOBS:process.env.CARGO_BUILD_JOBS??'2'});
 await cp(join(root,'.local/engine-target/release/openclaude-engine'+(process.platform==='win32'?'.exe':'')),join(output,'openclaude-engine'+(process.platform==='win32'?'.exe':'')));
 await cp(join(root,'vendor/upstream-lock.json'),join(output,'upstream-lock.json'));
 await mkdir(join(output,'licenses'),{recursive:true});await cp(join(root,'vendor/AionCore/LICENSE'),join(output,'licenses/AionCore.txt'));await cp(join(root,'vendor/aionrs/LICENSE'),join(output,'licenses/aionrs.txt'));await cp(join(root,'vendor/NOTICE'),join(output,'NOTICE'));
}else if(target==='web-host'){
 await build({absWorkingDir:root,entryPoints:['server/index.ts'],outfile:join(output,'server.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',target:'node22'});
}else if(target==='shared-ui'||target==='desktop'){
 await run(process.execPath,['node_modules/vite/bin/vite.js','build','--outDir',output],{OPENCLAUDE_EDITION:target==='desktop'?'desktop':'web'});
}else if(target==='inference'){
 await cp(join(root,'runtime/models'),join(output,'models'),{recursive:true,filter:path=>!path.includes('__pycache__')&&!path.endsWith('.pyc')});
 await writeFile(join(output,'manifest.json'),JSON.stringify({component:'inference',modelFilesBundled:false,platform:process.platform,arch:process.arch,version:JSON.parse(await readFile(join(root,'package.json'),'utf8')).version},null,2));
}else throw new Error('Unknown component target');
