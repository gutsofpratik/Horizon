import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import JSZip from 'jszip';
import {createHash} from 'node:crypto';
const run=promisify(execFile);
/** Read Git object bytes, not Windows checkout line-ending conversions. Never edit the source checkout. */
export async function sourceArchive(base:string,source:string,revision:string){
 if(!/^[a-zA-Z0-9_-]+$/.test(source)||!/^[a-f0-9]{40}$/.test(revision))throw Error('Invalid reviewed source pin');
 const root=join(base,source),actual=(await run('git',['-C',root,'rev-parse','HEAD'],{windowsHide:true})).stdout.trim();if(actual!==revision)throw Error('Source checkout does not match its reviewed revision: '+source);
 const dir=join(base,'.archives');await mkdir(dir,{recursive:true});const file=join(dir,source+'-'+revision+'-raw-v2.zip');try{await stat(file);}catch(error:any){if(error.code!=='ENOENT')throw error;await run('git',['-c','core.autocrlf=false','-c','core.eol=lf','-C',root,'archive','--format=zip','--output='+file,revision],{windowsHide:true,maxBuffer:1024*1024});}
 const archive=await JSZip.loadAsync(await readFile(file));
 const tree=(await run('git',['-C',root,'ls-tree','-rz',revision],{windowsHide:true,maxBuffer:20*1024*1024})).stdout;
 const blobs=new Map<string,string>();for(const entry of tree.split('\0')){const match=entry.match(/^\d+ blob ([a-f0-9]+)\t([\s\S]+)$/);if(match)blobs.set(match[2],match[1]);}
 const entries=Object.values(archive.files).filter(entry=>!entry.dir&&(Number(entry.unixPermissions)&0o170000)!==0o120000);
 const cache=new Map<string,Promise<Buffer>>();
 const bytes=(path:string):Promise<Buffer>=>{let pending=cache.get(path);if(!pending){pending=(async()=>{const entry=archive.file(path),object=blobs.get(path);if(!entry||!object||(Number(entry.unixPermissions)&0o170000)===0o120000)throw Error('Missing ordinary Git resource: '+path);let data=await entry.async('nodebuffer');const gitHash=(value:Buffer)=>createHash('sha1').update('blob '+value.length+'\0').update(value).digest('hex');
  // Attributes such as export-subst can alter archives too. Fall back to the
  // verified blob itself rather than silently changing original skill bytes.
  if(gitHash(data)!==object)data=(await run('git',['-C',root,'cat-file','blob',object],{windowsHide:true,encoding:'buffer',maxBuffer:40*1024*1024})).stdout;
  if(gitHash(data)!==object)throw Error('Original Git object integrity mismatch: '+source+'/'+path);return data;})();cache.set(path,pending);}return pending;};
 return {entries,blobs,bytes,text:async(path:string)=>(await bytes(path)).toString('utf8')};
}
