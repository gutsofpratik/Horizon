import test from 'node:test';import assert from 'node:assert/strict';import Fastify from 'fastify';
import {Store} from '../server/storage/database.ts';import {registerModelRuntime} from '../server/models/runtime.ts';
test('removing an idle selected model releases it; active inference is protected',async()=>{
 const app=Fastify();const store=new Store(':memory:');const context:any={root:process.cwd(),dataDirectory:'.local',store,ephemeral:new Map()};registerModelRuntime(app,context);
 const runtime=context.ephemeral.get('modelRuntime');let released=0;
 runtime.unload=async()=>{if((runtime as any).generations)throw new Error('Stop the current response before releasing the model');released++;runtime.loaded=null;};
 try{
  store.put('local_models',{id:'a',path:'a.gguf',configuration:{}});runtime.loaded={modelId:'a'};(runtime as any).generations=1;
  const active=await app.inject({method:'DELETE',url:'/api/model-library/a'});assert.notEqual(active.statusCode,200);assert.ok(store.get('local_models','a'));assert.equal(released,0);
  (runtime as any).generations=0;const idle=await app.inject({method:'DELETE',url:'/api/model-library/a'});assert.equal(idle.statusCode,200);assert.equal(released,1);assert.equal(store.get('local_models','a'),undefined);
 }finally{await app.close();store.close();}
});
