import test from 'node:test';import assert from 'node:assert/strict';import {ModelRuntime} from '../../server/models/runtime.ts';
test('tool schema changes retain policy cache; token measurement performs no inference',{skip:!process.env.OPENCLAUDE_TEST_GGUF,timeout:120000},async()=>{
 const runtime=new ModelRuntime(process.cwd());try{
 const entry={id:'tool-cache',path:process.env.OPENCLAUDE_TEST_GGUF,configuration:{engine:'llama.cpp',runtimeVariant:process.env.OPENCLAUDE_TEST_VARIANT??'stock',device:process.env.OPENCLAUDE_TEST_DEVICE??'cpu',contextTokens:2048,parallelPredictions:1,temperature:0,visionEnabled:false}};await runtime.load(entry);
 const tool={type:'function',function:{name:'calculate',description:'Calculate mathematics',parameters:{type:'object',properties:{expression:{type:'string'}},required:['expression']}}};const messages=[{role:'system',content:'You are a helpful assistant. Give short replies. '.repeat(45)},{role:'user',content:'Say hello. Do not use a tool.'}];
 const request={model:entry.id,cacheScope:'tools',messages,tools:[],thinking:true,maxTokens:512};const measurement=await runtime.measureFor(entry,request);const first=await runtime.call('generate',request);
 assert.equal(measurement.inputTokens,first.usage.prompt_tokens);assert.equal(first.usage.prompt_tokens_details.cached_tokens,0);
 const second=await runtime.call('generate',{...request,tools:[{...tool,function:{...tool.function,description:'Updated mathematics calculator description'}}]});
 assert.ok(second.usage.prompt_tokens_details.cached_tokens>350,'stable policy must remain cached when tool schemas change');console.log(JSON.stringify({first:first.usage,second:second.usage}));
 }finally{runtime.shutdown();}
});

