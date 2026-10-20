import test from 'node:test';import assert from 'node:assert/strict';
import {ModelRuntime} from '../../server/models/runtime.ts';
test('direct GGUF worker loads packed weights, streams, calls tools, cancels and unloads', {skip:!process.env.OPENCLAUDE_TEST_GGUF,timeout:300000},async()=>{
 const runtime=new ModelRuntime(process.cwd());const id='native-integration';
 try{
  const loaded=await runtime.load({id,path:process.env.OPENCLAUDE_TEST_GGUF,configuration:{engine:'llama.cpp',contextTokens:2048,outputTokens:256,temperature:0,device:process.env.OPENCLAUDE_TEST_DEVICE??'cpu'}});
  assert.equal(loaded.engine,'llama.cpp');assert.equal(loaded.quantized,true);assert.equal(loaded.configuration.contextTokens,2048);
  const events:any[]=[];
  const result=await runtime.call('generate',{model:id,messages:[{role:'user',content:'Call calculate to evaluate 17 * 23.'}],tools:[{type:'function',function:{name:'calculate',parameters:{type:'object',properties:{expression:{type:'string'}},required:['expression']}}}]},event=>events.push(event.data));
  assert.equal(result.finish_reason,'tool_calls');const call=events.flatMap(event=>event.tool_calls??[])[0];assert.equal(call.function.name,'calculate');assert.equal(typeof JSON.parse(call.function.arguments).expression,'string');
  const controller=new AbortController();await assert.rejects(runtime.call('generate',{model:id,messages:[{role:'user',content:'Count to 1000.'}]},()=>controller.abort(),controller.signal),/cancelled/);
  await runtime.unload();assert.equal(runtime.loaded,null);
 }finally{runtime.dispose();}
});
