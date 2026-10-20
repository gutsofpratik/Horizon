import test from 'node:test';import assert from 'node:assert/strict';
import {decodeRecords,normalizeEvents} from '../server/providers/streams.ts';
import {generate,modelContextSize} from '../server/providers/adapter.ts';
test('Ollama context metadata is resolved and inference receives explicit runtime options',async()=>{
 assert.equal(modelContextSize({parameters:'temperature 0.7\nnum_ctx 150000\n',model_info:{'qwen.context_length':262144}}),150000);
 assert.equal(modelContextSize({parameters:'num_ctx 32768'}),32768);
 assert.equal(modelContextSize({model_info:{'qwen.context_length':262144}}),undefined);
 const original=globalThis.fetch;let body:any;globalThis.fetch=async(_url:any,options:any)=>{body=JSON.parse(options.body);return new Response('{"done":true}\n',{status:200});};try{for await(const event of generate({id:'o',name:'Ollama',type:'ollama',baseUrl:'http://localhost:11434'},{model:'custom-150k',messages:[],numCtx:8192,maxTokens:4096,temperature:0.7},new AbortController().signal))void event;assert.deepEqual(body.options,{num_ctx:8192,num_predict:4096,temperature:0.7});assert.equal(body.keep_alive,-1);}finally{globalThis.fetch=original;}
});
test('decodes arbitrarily split UTF-8 NDJSON records',async()=>{
 const bytes=new TextEncoder().encode('{"message":{"content":"hello 🌍"}}\n{"done":true}\n');
 const body=new ReadableStream<Uint8Array>({start(controller){for(let i=0;i<bytes.length;i+=3)controller.enqueue(bytes.slice(i,i+3));controller.close();}});
 const records=[];for await(const record of decodeRecords(body,'ndjson'))records.push(record);assert.equal(records[0]?.message?.content,'hello 🌍');assert.equal(records[1]?.done,true);
});
test('assembles OpenAI SSE tool arguments before emitting a call',async()=>{
 const records=[{choices:[{delta:{tool_calls:[{index:0,id:'call_1',function:{name:'calculate',arguments:'{"expression":"17'}}]}}]},{choices:[{delta:{tool_calls:[{index:0,function:{arguments:' * 23"}'}}]},finish_reason:'tool_calls'}]}];
 async function* source(){yield* records;}const events=[];for await(const event of normalizeEvents(source(),'openai'))events.push(event);
 assert.deepEqual(events.filter(event=>event.type==='tool_call'),[{type:'tool_call',id:'call_1',name:'calculate',arguments:{expression:'17 * 23'}}]);
 assert.equal(events[0].type,'tool_progress');assert.equal(events[0].name,'calculate');assert.equal(events[0].argumentBytes,17);assert.ok(!('arguments' in events[0]));
});
test('invalid streamed tool arguments are rejected rather than executed',async()=>{
 async function* source(){yield {choices:[{delta:{tool_calls:[{index:0,id:'c',function:{name:'calculate',arguments:'{invalid'}}]},finish_reason:'tool_calls'}]};}
 const events=[];for await(const event of normalizeEvents(source(),'openai'))events.push(event);const call=events.find(event=>event.type==='tool_call');assert.ok(call.argumentError);assert.match(call.argumentError,/malformed|incomplete/i);assert.deepEqual(call.arguments,{});assert.equal(events.at(-1).type,'done');
});
test('inference keep-alives are ignored and real tool-generation progress is preserved',async()=>{
 const input=': inference keep-alive\n\ndata: '+JSON.stringify({choices:[{delta:{openclaude_progress:{phase:'tool_arguments',generatedCharacters:12345,elapsedSeconds:12}}}]})+'\n\ndata: [DONE]\n\n';
 const body=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode(input));controller.close();}});const events=[];
 for await(const event of normalizeEvents(decodeRecords(body,'sse'),'openai'))events.push(event);
 assert.deepEqual(events[0],{type:'model_progress',phase:'tool_arguments',generatedCharacters:12345,elapsedSeconds:12});assert.equal(events.at(-1).type,'done');assert.ok(!events.some(event=>event.type==='tool_call'||event.type==='content'));
});

test('conversation cache scope is sent only to the built-in runtime',async()=>{const original=globalThis.fetch;let body:any;globalThis.fetch=async(_url:any,options:any)=>{body=JSON.parse(options.body);return new Response('data: [DONE]\n\n',{status:200});};try{for(const id of ['builtin','external']){for await(const event of generate({id,name:'Test',type:'openai',baseUrl:'http://localhost/v1'},{model:'test',messages:[],cacheScope:'isolated-chat'},new AbortController().signal))void event;if(id==='builtin')assert.equal(body.cache_scope,'isolated-chat');else assert.ok(!Object.hasOwn(body,'cache_scope'));}}finally{globalThis.fetch=original;}});
test('built-in inference has no hidden 4096 output cap when only total context is configured',async()=>{const original=globalThis.fetch;let body:any;globalThis.fetch=async(_url,options)=>{body=JSON.parse(String(options?.body));return new Response('data: [DONE]\n\n');};try{for await(const _ of generate({id:'builtin',name:'Native',type:'openai',baseUrl:'http://localhost/v1'},{model:'test',messages:[]},new AbortController().signal)){}assert.equal(body.max_tokens,undefined);for await(const _ of generate({id:'builtin',name:'Native',type:'openai',baseUrl:'http://localhost/v1'},{model:'test',messages:[],maxTokens:60000},new AbortController().signal)){}assert.equal(body.max_tokens,60000);}finally{globalThis.fetch=original;}});

test('native argument parse errors reach tool validation and never become executable arguments',async()=>{async function* source(){yield {choices:[{delta:{tool_calls:[{index:0,id:'bad-native',function:{name:'toolkit',arguments:'{}',argument_error:'arguments must be a JSON object'}}]},finish_reason:'tool_calls'}]};}const events=[];for await(const event of normalizeEvents(source(),'openai'))events.push(event);const call=events.find(e=>e.type==='tool_call');assert.equal(call.argumentError,'arguments must be a JSON object');assert.deepEqual(call.arguments,{});});
