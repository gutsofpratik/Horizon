import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
const manifest=JSON.parse(await readFile('scripts/release/inputs.json','utf8'));
const input=process.platform==='win32'?manifest.python:manifest.pythonPlatforms?.[process.platform+'-'+process.arch];
if(!input)throw new Error('No pinned Python runtime for this platform/architecture');
const folder=resolve('.local','redistributable-python',process.platform+'-'+process.arch);await mkdir(folder,{recursive:true});
const archive=join(folder,'python.tar.gz');let bytes=await readFile(archive).catch(()=>null);
if(!bytes||createHash('sha256').update(bytes).digest('hex')!==input.sha256){const response=await fetch(input.url);if(!response.ok)throw new Error('Python download returned '+response.status);bytes=Buffer.from(await response.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==input.sha256)throw new Error('Python checksum mismatch');await writeFile(archive,bytes);}
await new Promise((resolveTask,reject)=>{const child=spawn('tar',['-xzf',archive,'-C',folder],{stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolveTask():reject(new Error('Python extraction failed')));});
const root=join(folder,'python');await stat(join(root,process.platform==='win32'?'python.exe':'bin/python3'));
if(process.env.GITHUB_ENV)await writeFile(process.env.GITHUB_ENV,'OPENCLAUDE_PYTHON_ROOT='+root+'\n',{flag:'a'});
console.log(root);
