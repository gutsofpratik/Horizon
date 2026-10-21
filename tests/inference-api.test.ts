import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {createServer} from 'node:net';
import {registerInferenceApi} from '../server/models/api-server.ts';

test('external inference is keyed, isolated and serves only the ready loaded model',async()=>{
 const probe=createServer();await new Promise<void>(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=(probe.address() as any).port;await new Promise<void>(resolve=>probe.close(()=>resolve()));
 const app=Fastify();let generations=0;
 const runtime:any={loaded:{modelId:'local-1',configuration:{contextTokens:60000}},status:'ready',isReady:()=>true,generateFor:async(_entry:any,_args:any,event:any)=>{generations++;event({event:'chunk',data:{content:'Hello'}});return {finish_reason:'stop',usage:{prompt_tokens:2,completion_tokens:1,total_tokens:3}};}};
 registerInferenceApi(app,{store:{get:()=>({id:'local-1',name:'Local model'})}} as any,runtime);
 try{
  assert.equal((await app.inject({method:'POST',url:'/api/inference-api/start',payload:{port}})).statusCode,500);
  const issued=(await app.inject({method:'POST',url:'/api/inference-api/key'})).json();assert.match(issued.key,/^hzn_/);
  assert.equal((await app.inject({method:'POST',url:'/api/inference-api/start',payload:{port}})).statusCode,200);
  const url=`http://127.0.0.1:${port}/v1/chat/completions`,headers={authorization:'Bearer '+issued.key,'content-type':'application/json'};
  assert.equal((await fetch(url,{method:'POST',body:'{}'})).status,401);
  assert.equal((await fetch(url,{method:'POST',headers:{...headers,origin:'https://example.com'},body:'{}'})).status,403);
  const mismatch=await fetch(url,{method:'POST',headers,body:JSON.stringify({model:'different',messages:[{role:'user',content:'hi'}]})});assert.equal(mismatch.status,409);assert.equal(generations,0);
  const reply=await fetch(url,{method:'POST',headers,body:JSON.stringify({model:'local-1',messages:[{role:'user',content:'hi'}]})});assert.equal(reply.status,200);assert.equal((await reply.json()).choices[0].message.content,'Hello');
  const streamed=await fetch(url,{method:'POST',headers,body:JSON.stringify({messages:[{role:'user',content:'hi'}],stream:true})});assert.match(await streamed.text(),/\[DONE\]/);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/entities/settings`,{headers})).status,404);
  const replaced=(await app.inject({method:'POST',url:'/api/inference-api/key'})).json();assert.notEqual(replaced.key,issued.key);
  assert.equal((await fetch(url,{method:'POST',headers,body:'{}'})).status,401);
  const revoked=await app.inject({method:'DELETE',url:'/api/inference-api/key'});assert.equal(revoked.json().running,false);
 }finally{await app.close();}
});
