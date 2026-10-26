import {readFile,writeFile,mkdir,mkdtemp,rename,cp,stat,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import JSZip from 'jszip';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function ensureEngineSources(root=resolve(fileURLToPath(new URL('..',import.meta.url)))){
 const config=await readFile(join(root,'third-party/engine/sources.json'));const lock=JSON.parse(config),patches=[];
 for(const source of lock.sources){if(!/^https:\/\/github\.com\/iOfficeAI\/(AionCore|aionrs)$/.test(source.repository)||!/^vendor\/(AionCore|aionrs)$/.test(source.directory)||!/^[a-f0-9]{40}$/.test(source.revision))throw Error('Invalid pinned engine source');const patch=await readFile(join(root,source.patch));if(digest(patch)!==source.patchSha256)throw Error('Engine patch checksum mismatch');patches.push(patch);}
 const identity=digest(Buffer.concat([config,...patches]));const destination=join(root,'vendor'),stamp=join(destination,'.horizon-sources.json');
 try{if(JSON.parse(await readFile(stamp,'utf8')).identity===identity){await Promise.all(lock.sources.map(source=>stat(join(root,source.directory,'Cargo.toml'))));return destination;}}catch{}
 try{await stat(destination);throw Error('Generated vendor directory exists without the expected source stamp. Move it aside before preparing pinned sources.');}catch(error){if(error.code!=='ENOENT')throw error;}
 const temporary=await mkdtemp(join(tmpdir(),'horizon-engine-')),stage=join(temporary,'vendor');await mkdir(stage);
 try{for(let index=0;index<lock.sources.length;index++){const source=lock.sources[index],name=source.repository.split('/').at(-1),target=join(stage,name);await mkdir(target);const response=await fetch(source.repository.replace('https://github.com/','https://codeload.github.com/')+'/zip/'+source.revision,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error('Engine source download returned '+response.status);const bytes=Buffer.from(await response.arrayBuffer());if(digest(bytes)!==source.archiveSha256)throw Error('Pinned archive checksum mismatch for '+name);const zip=await JSZip.loadAsync(bytes);for(const entry of Object.values(zip.files)){if(entry.dir)continue;const path=entry.name.split('/').slice(1).join('/');if(!path||path.split('/').some(part=>part==='..'||part.includes('\\')))throw Error('Unsafe source archive path');const output=resolve(target,path);if(!output.startsWith(target+sep))throw Error('Source entry escaped its root');await mkdir(dirname(output),{recursive:true});await writeFile(output,await entry.async('nodebuffer'));if(process.platform!=='win32'&&entry.unixPermissions)await chmod(output,Number(entry.unixPermissions)&0o777);}
 const init=spawnSync('git',['init','--quiet',target],{windowsHide:true,encoding:'utf8'});if(init.status!==0)throw Error('Git is required to apply the pinned engine patches');for(const check of [true,false]){const result=spawnSync('git',['apply',...(check?['--check']:[]),'-'],{cwd:target,input:patches[index],windowsHide:true,encoding:'utf8'});if(result.status!==0)throw Error('Pinned engine patch failed: '+result.stderr);}const gitDir=resolve(target,'.git');if(!gitDir.startsWith(resolve(temporary)+sep))throw Error('Invalid temporary Git directory');await rm(gitDir,{recursive:true,force:true});console.log('Prepared pinned '+name+' source and Horizon changes');}
 await cp(join(root,'third-party/engine/NOTICE'),join(stage,'NOTICE'));await writeFile(join(stage,'upstream-lock.json'),config);await writeFile(join(stage,'.horizon-sources.json'),JSON.stringify({identity})+'\n');await cp(stage,destination,{recursive:true});
 }finally{const checked=resolve(temporary);if(!checked.startsWith(resolve(tmpdir())+sep))throw Error('Invalid engine staging directory');await rm(checked,{recursive:true,force:true});}
 return destination;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await ensureEngineSources();
