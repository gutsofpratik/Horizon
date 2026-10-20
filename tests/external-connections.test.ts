import test from 'node:test';import assert from 'node:assert/strict';
import {searchExternal} from '../server/search/external.ts';
import {listModels,generate} from '../server/providers/adapter.ts';
import {validateSettings} from '../server/settings/validation.ts';

test('Brave sends its key in a header, maps web results, and supports pagination',async t=>{
 let address='',options:any;t.mock.method(globalThis,'fetch',async(url:any,init:any)=>{address=String(url);options=init;return Response.json({web:{results:[{title:'Result',url:'https://example.com',description:'A snippet'}]}});});
 const result=await searchExternal({searchProvider:'brave',searchApiKey:'PRIVATE'},'hello',5,'week',AbortSignal.timeout(1000),2);
 assert.equal(new URL(address).searchParams.get('offset'),'1');assert.equal(options.headers['X-Subscription-Token'],'PRIVATE');assert.ok(!address.includes('PRIVATE'));assert.equal(options.redirect,'error');assert.equal(result.body.results[0].content,'A snippet');
});
test('Tavily sends search options and never pretends to provide later pages',async t=>{
 let count=0;t.mock.method(globalThis,'fetch',async(_url:any,init:any)=>{count++;assert.equal(init.headers.Authorization,'Bearer PRIVATE');assert.equal(JSON.parse(init.body).include_answer,false);return Response.json({results:[{title:'T',url:'https://example.com',content:'Text'}]});});
 const settings={searchProvider:'tavily',searchApiKey:'PRIVATE'};
 const first=await searchExternal(settings,'q',5,'any',AbortSignal.timeout(1000),1);assert.equal(first.paginationSupported,false);
 const next=await searchExternal(settings,'q',5,'any',AbortSignal.timeout(1000),2);assert.deepEqual(next.body.results,[]);assert.equal(count,1);
});
test('custom search requires a safe configured URL and rejects malformed responses without leaking keys',async t=>{
 await assert.rejects(searchExternal({searchProvider:'custom',searchApiUrl:'https://user:secret@example.com'},'q',1,'any',AbortSignal.timeout(1000),1),/URL/);
 t.mock.method(globalThis,'fetch',async()=>Response.json({unexpected:'PRIVATE'}));
 await assert.rejects(searchExternal({searchProvider:'custom',searchApiUrl:'https://example.com/search',searchApiKey:'PRIVATE'},'q',1,'any',AbortSignal.timeout(1000),1),/results/);
 assert.throws(()=>validateSettings({searchProvider:'made-up'}));
});
test('manual model IDs support compatible APIs without a model-list endpoint',async t=>{
 t.mock.method(globalThis,'fetch',async()=>{throw Error('must not request /models');});
 const models=await listModels({id:'cloud',name:'Custom',type:'openai',baseUrl:'https://example.com/v1',modelIds:['vendor/model']});
 assert.equal(models[0].id,'vendor/model');assert.equal(models[0].providerId,'cloud');
});
test('cloud streaming uses the configured base URL and bearer key',async t=>{
 t.mock.method(globalThis,'fetch',async(url:any,init:any)=>{assert.equal(String(url),'https://openrouter.ai/api/v1/chat/completions');assert.equal(init.headers.Authorization,'Bearer PRIVATE');assert.equal(init.redirect,'error');return new Response('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});});
 const events=[];for await(const event of generate({id:'router',name:'OpenRouter',type:'openai',baseUrl:'https://openrouter.ai/api/v1',apiKey:'PRIVATE'},{model:'vendor/model',messages:[{role:'user',content:'Hi'}]},AbortSignal.timeout(1000)))events.push(event);
 assert.ok(events.some(event=>event.type==='content'&&event.text==='Hello'));
});
