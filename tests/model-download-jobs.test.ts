import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {mkdtemp,rm,readFile,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {registerModelDownloads} from '../server/models/downloads.ts';

test('download jobs reject traversal, verify weights and retain resumable state',async()=>{
 const dataDirectory=await mkdtemp(join(tmpdir(),'horizon-downloads-'));const rows=new Map<string,any>();
 const store={get:(bucket:string,id:string)=>rows.get(bucket+':'+id),put:(bucket:string,item:any)=>{const copy=structuredClone(item);rows.set(bucket+':'+item.id,copy);return copy;},list:(bucket:string)=>[...rows].filter(([key])=>key.startsWith(bucket+':')).map(([,value])=>structuredClone(value))};
 const bytes=Buffer.from('model-fixture'),hash=createHash('sha256').update(bytes).digest('hex'),original=globalThis.fetch;
 globalThis.fetch=(async(url:any)=>String(url).includes('/api/models/')?new Response(JSON.stringify({siblings:[{rfilename:'model.gguf',size:bytes.length,lfs:{sha256:hash}}]})):new Response(bytes)) as any;
 const app=Fastify();registerModelDownloads(app,{dataDirectory,store} as any);
 const payload={repo:'publisher/model',revision:'a'.repeat(40),files:['model.gguf'],configuration:{engine:'llama.cpp'}};
 try{
  assert.equal((await app.inject({method:'POST',url:'/api/model-library/download',payload:{...payload,files:['../model.gguf']}})).statusCode,500);
  const job=(await app.inject({method:'POST',url:'/api/model-library/download',payload})).json();let state:any;
  for(let i=0;i<100;i++){state=(await app.inject('/api/model-library/downloads/'+job.id)).json();if(state.status!=='downloading')break;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.equal(state.status,'completed',state.error);assert.equal(state.progress.bytes,bytes.length);assert.equal(state.directory,undefined);
  const model=store.list('local_models')[0];assert.deepEqual(await readFile(model.path),bytes);
  assert.equal((await app.inject({method:'POST',url:'/api/model-library/downloads/'+job.id+'/cancel'})).statusCode,500,'cancelling must not remove completed model files');
  assert.equal((await app.inject('/api/model-library/downloads')).json().downloads.length,1);
  const resumedId='resume-complete',directory=join(dataDirectory,'models/downloads',resumedId);await mkdir(directory,{recursive:true});await writeFile(join(directory,'model.gguf.horizon-part'),bytes);
  store.put('model_downloads',{id:resumedId,...payload,directory,status:'paused'});
  const previousFetch=globalThis.fetch;globalThis.fetch=(async(url:any)=>{if(!String(url).includes('/api/models/'))throw new Error('A complete partial must not request another byte range');return previousFetch(url);}) as any;
  await app.inject({method:'POST',url:'/api/model-library/downloads/'+resumedId+'/resume'});
  for(let i=0;i<100;i++){state=(await app.inject('/api/model-library/downloads/'+resumedId)).json();if(state.status!=='downloading')break;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.equal(state.status,'completed',state.error);assert.deepEqual(await readFile(join(directory,'model.gguf')),bytes);
 }finally{await app.close();globalThis.fetch=original;await rm(dataDirectory,{recursive:true,force:true});}
});
