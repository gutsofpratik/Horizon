import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {createServer} from 'node:net';
import {registerInferenceApi} from '../server/models/api-server.ts';

test('external inference is keyed, isolated and serves only the ready loaded model',async()=>{
 const probe=createServer();await new Promise<void>(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=(probe.address() as any).port;await new Promise<void>(resolve=>probe.close(()=>resolve()));
 const app=Fastify();let generations=0;
 const runtime:any={loaded:{modelId:'local-1',configuration:{contextTokens:60000}},status:'ready',isReady:()=>true,generateFor:async(_entry:any,_args:any,event:any)=>{generations++;event({event:'chunk',data:{content:'Hello'}});return {finish_reason:'stop',usage:{prompt_tokens:2,completion_tokens:1,total_tokens:3}};}};
 registerInferenceApi(app,{ephemeral:new Map([['providerVaultKey',Buffer.alloc(32,7)]]),store:{get:(table:string)=>table==='local_models'?{id:'local-1',name:'Local model'}:undefined,put:()=>{}}} as any,runtime);
 try{
  const started=await app.inject({method:'POST',url:'/api/inference-api/start',payload:{port}});assert.equal(started.statusCode,200);assert.match(started.json().key,/^hzn_/);
  const issued=(await app.inject({method:'POST',url:'/api/inference-api/key'})).json();assert.match(issued.key,/^hzn_/);
  assert.equal((await app.inject({method:'POST',url:'/api/inference-api/start',payload:{port}})).statusCode,200);
  const url=`http://127.0.0.1:${port}/v1/chat/completions`,headers={authorization:'Bearer '+issued.key,'content-type':'application/json'};
  const models=await (await fetch(`http://127.0.0.1:${port}/v1/models`,{headers})).json();
  assert.equal(models.data[0].id,'Local model');assert.equal(models.data[0].name,'Local model');assert.equal(models.data[0].context_length,60000);
  const named=await fetch(url,{method:'POST',headers,body:JSON.stringify({model:models.data[0].id,messages:[{role:'user',content:'hi'}]})});assert.equal(named.status,200);assert.equal((await named.json()).model,'Local model');generations=0;
  assert.equal((await fetch(url,{method:'POST',body:'{}'})).status,401);
  assert.equal((await fetch(url,{method:'POST',headers:{...headers,origin:'https://example.com'},body:'{}'})).status,403);
  const mismatch=await fetch(url,{method:'POST',headers,body:JSON.stringify({model:'different',messages:[{role:'user',content:'hi'}]})});assert.equal(mismatch.status,409);assert.equal(generations,0);
  const reply=await fetch(url,{method:'POST',headers,body:JSON.stringify({model:'local-1',messages:[{role:'user',content:'hi'}]})});assert.equal(reply.status,200);assert.equal((await reply.json()).choices[0].message.content,'Hello');
  const streamed=await fetch(url,{method:'POST',headers,body:JSON.stringify({messages:[{role:'user',content:'hi'}],stream:true})});assert.match(await streamed.text(),/\[DONE\]/);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/entities/settings`,{headers})).status,404);
  const replaced=(await app.inject({method:'POST',url:'/api/inference-api/key'})).json();assert.notEqual(replaced.key,issued.key);
  assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({messages:[{role:'user',content:'hi'}]})})).status,200);
  const listed=(await app.inject('/api/inference-api')).json();assert.equal(listed.keys.length,3);assert.equal(JSON.stringify(listed).includes(issued.key),false);
  const keyId=issued.keys.at(-1).id;
  const revealed=await app.inject({method:'POST',url:'/api/inference-api/keys/'+keyId+'/reveal'});assert.equal(revealed.json().key,issued.key);assert.equal(revealed.headers['cache-control'],'no-store');
  assert.equal((await app.inject({method:'POST',url:'/api/inference-api/keys/'+keyId+'/restore',payload:{key:'wrong'}})).statusCode,400);
  assert.equal((await app.inject({method:'POST',url:'/api/inference-api/keys/'+keyId+'/restore',payload:{key:issued.key}})).statusCode,200);
  await app.inject({method:'DELETE',url:'/api/inference-api/keys/'+keyId});
  assert.equal((await fetch(url,{method:'POST',headers,body:'{}'})).status,401);
  assert.equal((await app.inject('/api/inference-api')).json().running,true);
  const revoked=await app.inject({method:'DELETE',url:'/api/inference-api/key'});assert.equal(revoked.json().running,false);
 }finally{await app.close();}
});

test('external requests automatically load the saved selection and accept its short alias',async()=>{
 const probe=createServer();await new Promise<void>(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=(probe.address() as any).port;await new Promise<void>(resolve=>probe.close(()=>resolve()));
 const app=Fastify(),entry={id:'saved-model',name:'Bonsai 2 27B · PTQ1 · Prism',configuration:{contextTokens:60000}};let calls=0;
 const runtime:any={loaded:null,status:'idle',generateFor:async(selected:any,_args:any,event:any)=>{assert.equal(selected.id,entry.id);calls++;runtime.loaded={modelId:entry.id};event({event:'chunk',data:{content:'Hi'}});return {finish_reason:'stop'};}};
 const context:any={ephemeral:new Map([['providerVaultKey',Buffer.alloc(32,7)]]),store:{get:(bucket:string)=>bucket==='settings'?{providerId:'builtin',model:entry.id}:bucket==='local_models'?entry:undefined,put:()=>{}}};
 registerInferenceApi(app,context,runtime);
 try{
  const key=(await app.inject({method:'POST',url:'/api/inference-api/start',payload:{port}})).json().key,headers={authorization:'Bearer '+key,'content-type':'application/json'};
  const listing=await (await fetch('http://127.0.0.1:'+port+'/v1/models',{headers})).json();assert.equal(listing.data[0].loaded,false);assert.equal(listing.data[0].context_length,60000);assert.ok(listing.data[0].aliases.includes('Bonsai'));
  const response=await fetch('http://127.0.0.1:'+port+'/v1/chat/completions',{method:'POST',headers,body:JSON.stringify({model:'bonsai',messages:[{role:'user',content:'Hi'}]})});assert.equal(response.status,200);assert.equal((await response.json()).choices[0].message.content,'Hi');assert.equal(calls,1);
  const detail=await fetch('http://127.0.0.1:'+port+'/v1/models/bonsai',{headers});assert.equal(detail.status,200);assert.equal((await detail.json()).name,entry.name);
  const legacy=await fetch('http://127.0.0.1:'+port+'/v1/completions',{method:'POST',headers,body:JSON.stringify({model:'bonsai',prompt:'Hi'})});assert.equal(legacy.status,200);assert.equal((await legacy.json()).choices[0].text,'Hi');
  const modern=await fetch('http://127.0.0.1:'+port+'/v1/responses',{method:'POST',headers,body:JSON.stringify({model:'bonsai',input:'Hi'})});assert.equal(modern.status,200);assert.equal((await modern.json()).output[0].content[0].text,'Hi');
  const modernStream=await fetch('http://127.0.0.1:'+port+'/v1/responses',{method:'POST',headers,body:JSON.stringify({model:'bonsai',input:'Hi',stream:true})});assert.equal(modernStream.status,200);const events=await modernStream.text();assert.match(events,/event: response.output_text.delta/);assert.match(events,/event: response.completed/);
 }finally{await app.close();}
});

test('endpoint and key survive host restarts until explicitly disabled',async()=>{
 const probe=createServer();await new Promise<void>(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=(probe.address() as any).port;await new Promise<void>(resolve=>probe.close(()=>resolve()));
 let record:any;
 const context:any={ephemeral:new Map([['providerVaultKey',Buffer.alloc(32,7)]]),store:{get:()=>record,put:(_table:string,value:any)=>{record=value;}}};
 const runtime:any={loaded:null,status:'idle'};
 const first=Fastify();registerInferenceApi(first,context,runtime);
 let key:string;
 try{const result=await first.inject({method:'POST',url:'/api/inference-api/start',payload:{port}});assert.equal(result.statusCode,200);key=result.json().key;assert.equal(record.enabled,true);assert.equal(JSON.stringify(record).includes(key),false);}finally{await first.close();}
 const second=Fastify();registerInferenceApi(second,context,runtime);
 try{
  await second.ready();assert.equal((await second.inject('/api/inference-api')).json().running,true);
  const restoredKey=(await second.inject({method:'POST',url:'/api/inference-api/keys/'+record.keys[0].id+'/reveal'})).json();assert.equal(restoredKey.key,key!);
  const response=await fetch(`http://127.0.0.1:${port}/v1/models`,{headers:{authorization:'Bearer '+key!}});assert.equal(response.status,200);
  await second.inject({method:'POST',url:'/api/inference-api/stop'});assert.equal(record.enabled,false);
 }finally{await second.close();}
 const third=Fastify();registerInferenceApi(third,context,runtime);
 try{await third.ready();assert.equal((await third.inject('/api/inference-api')).json().running,false);}finally{await third.close();}
});
