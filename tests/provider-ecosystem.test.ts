import test from 'node:test';
import assert from 'node:assert/strict';
import {generate,listModels,validateProvider,publicProvider,providerCredential,type Provider} from '../server/providers/adapter.ts';
import {anthropicBody,geminiBody,responsesBody,nativeEvents} from '../server/providers/native.ts';
import {bedrockBody,bedrockEvents,vertexEndpoint} from '../server/providers/enterprise.ts';
import {providerProfiles} from '../server/providers/catalog.ts';
import {createServer} from 'node:http2';
import {GoogleAuth} from 'google-auth-library';
const p=(type:Provider['type'],extra:Partial<Provider>={}):Provider=>({id:type,name:type,type,baseUrl:'https://example.test/v1',...extra});
async function* records(items:any[]){yield* items;}
async function collect(source:AsyncIterable<any>){const result=[];for await(const value of source)result.push(value);return result;}
function sse(items:any[]){return new Response(items.map(value=>'data: '+JSON.stringify(value)+'\n\n').join(''));}
const tool={type:'function',function:{name:'weather',description:'Get weather',parameters:{type:'object',properties:{city:{type:'string'}},required:['city']}}};
const history=[{role:'system',content:'Be precise'},{role:'user',content:'Weather?'},{role:'assistant',content:'',tool_calls:[{id:'call_1',type:'function',function:{name:'weather',arguments:'{"city":"Delhi"}'}}]},{role:'tool',tool_call_id:'call_1',tool_name:'weather',content:'Sunny'}];

test('native request builders preserve tool IDs, native schemas, and tool-result roles',()=>{
 const request={model:'model',messages:history,tools:[tool],toolChoice:'required' as const};
 const a=anthropicBody(request);assert.equal(a.system,'Be precise');assert.equal(a.messages[1].content[0].type,'tool_use');assert.equal(a.messages[2].content[0].tool_use_id,'call_1');assert.equal(a.tool_choice?.type,'any');assert.deepEqual(a.tools?.[0].input_schema,tool.function.parameters);
 const g=geminiBody(request);assert.equal(g.contents[1].parts[0].functionCall.id,'call_1');assert.equal(g.contents[2].parts[0].functionResponse.id,'call_1');assert.equal(g.toolConfig?.functionCallingConfig.mode,'ANY');
 const r=responsesBody(request);assert.ok(r.input.some((i:any)=>i.type==='function_call'&&i.call_id==='call_1'));assert.ok(r.input.some((i:any)=>i.type==='function_call_output'&&i.call_id==='call_1'));assert.equal(r.store,false);
 const b=bedrockBody(request);assert.equal(b.messages[1].content[0].toolUse.toolUseId,'call_1');assert.equal(b.messages[2].content[0].toolResult.toolUseId,'call_1');
});
test('Anthropic stream buffers tools until message completion, preserves signatures and token usage',async()=>{
 const events=await collect(nativeEvents(records([{type:'message_start',message:{usage:{input_tokens:50}}},{type:'content_block_start',index:0,content_block:{type:'thinking',thinking:'',signature:''}},{type:'content_block_delta',index:0,delta:{type:'thinking_delta',thinking:'Consider'}},{type:'content_block_delta',index:0,delta:{type:'signature_delta',signature:'signed'}},{type:'content_block_start',index:1,content_block:{type:'tool_use',id:'t1',name:'weather',input:{}}},{type:'content_block_delta',index:1,delta:{type:'input_json_delta',partial_json:'{"city":'}},{type:'content_block_delta',index:1,delta:{type:'input_json_delta',partial_json:'"Delhi"}'}},{type:'message_delta',delta:{stop_reason:'tool_use'},usage:{output_tokens:12}},{type:'message_stop'}]),'anthropic'));
 const call=events.find(e=>e.type==='tool_call');assert.deepEqual(call.arguments,{city:'Delhi'});const metadata=events.find(e=>e.type==='provider_metadata').providerData;assert.equal(metadata.anthropic[0].signature,'signed');assert.equal(events.at(-1).usage.input,50);assert.equal(events.at(-1).usage.output,12);
 const body=anthropicBody({model:'x',messages:[{role:'assistant',content:'',providerData:metadata}]});assert.equal(body.messages[0].content[0].signature,'signed');
});
test('native streams reject truncation and provider errors before tool execution',async()=>{
 await assert.rejects(collect(nativeEvents(records([{type:'content_block_start',index:0,content_block:{type:'tool_use',id:'t',name:'x',input:{}}},{type:'message_delta',delta:{stop_reason:'max_tokens'}},{type:'message_stop'}]),'anthropic')),/did not complete/);
 await assert.rejects(collect(nativeEvents(records([{type:'content_block_start',index:0,content_block:{type:'text',text:'partial'}}]),'anthropic')),/before completion/);
 await assert.rejects(collect(nativeEvents(records([{type:'error',error:{message:'Overloaded'}}]),'anthropic')),/Overloaded/);
 await assert.rejects(collect(nativeEvents(records([{type:'response.incomplete',response:{incomplete_details:{reason:'max_output_tokens'}}}]),'responses')),/max_output_tokens/);
});
test('Gemini preserves thought signatures and matching response IDs through tool continuation',async()=>{
 const events=await collect(nativeEvents(records([{candidates:[{content:{parts:[{functionCall:{id:'gem_1',name:'weather',args:{city:'Delhi'}},thoughtSignature:'sig'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:20,candidatesTokenCount:5}}]),'gemini'));
 const metadata=events.find(e=>e.type==='provider_metadata').providerData;const call=events.find(e=>e.type==='tool_call');assert.equal(call.id,'gem_1');assert.equal(call.providerData.thoughtSignature,'sig');
 const request=geminiBody({model:'m',messages:[{role:'assistant',content:'',providerData:metadata},{role:'tool',tool_call_id:'gem_1',tool_name:'weather',content:'Sunny'}]});assert.equal(request.contents[0].parts[0].thoughtSignature,'sig');assert.equal(request.contents[1].parts[0].functionResponse.id,'gem_1');assert.equal(events.at(-1).usage.input,20);
});
test('Responses streams accumulate arguments and replay native encrypted reasoning output',async()=>{
 const output=[{type:'reasoning',id:'r',encrypted_content:'opaque',summary:[]},{type:'function_call',id:'fc_1',call_id:'c1',name:'weather',arguments:'{"city":"Delhi"}'}];
 const events=await collect(nativeEvents(records([{type:'response.output_item.added',item:{type:'function_call',id:'fc_1',call_id:'c1',name:'weather',arguments:''}},{type:'response.function_call_arguments.delta',item_id:'fc_1',delta:'{"city":"Delhi"}'},{type:'response.completed',response:{output,usage:{input_tokens:40,output_tokens:9}}}]),'responses'));
 assert.deepEqual(events.find(e=>e.type==='tool_call').arguments,{city:'Delhi'});const metadata=events.find(e=>e.type==='provider_metadata').providerData;assert.deepEqual(responsesBody({model:'m',messages:[{role:'assistant',providerData:metadata}]}).input,output);
});
test('Bedrock Converse events preserve native tool IDs, reasoning and metadata',async()=>{
 const events=await collect(bedrockEvents(records([{contentBlockStart:{contentBlockIndex:0,start:{toolUse:{toolUseId:'aws1',name:'weather'}}}},{contentBlockDelta:{contentBlockIndex:0,delta:{toolUse:{input:'{"city":"Delhi"}'}}}},{messageStop:{stopReason:'tool_use'}},{metadata:{usage:{inputTokens:32,outputTokens:8}}}])));
 assert.equal(events.find(e=>e.type==='tool_call').id,'aws1');assert.deepEqual(events.find(e=>e.type==='tool_call').arguments,{city:'Delhi'});assert.equal(events.at(-1).usage.output,8);assert.equal(events.find(e=>e.type==='provider_metadata').providerData.bedrock[0].toolUse.toolUseId,'aws1');
 await assert.rejects(collect(bedrockEvents(records([{throttlingException:{message:'Rate limited'}}]))),/Rate limited/);
});
test('native HTTP adapters use protocol endpoints and authentication headers',async()=>{
 const original=globalThis.fetch;const seen:any[]=[];globalThis.fetch=async(url,options)=>{seen.push({url:String(url),headers:options?.headers,body:JSON.parse(String(options?.body))});return seen.at(-1).body.contents?sse([{candidates:[{content:{parts:[{text:'Hello'}]},finishReason:'STOP'}]}]):seen.at(-1).body.input?sse([{type:'response.completed',response:{output:[]}}]):sse([{type:'message_delta',delta:{stop_reason:'end_turn'}},{type:'message_stop'}]);};
 try{for(const type of ['anthropic','gemini','responses','azure'] as const){await collect(generate(p(type,{apiKey:'secret',baseUrl:type==='azure'?'https://resource.openai.azure.com/openai/v1':'https://example.test/v1'}),{model:'deployment',messages:[{role:'user',content:'hello'}]},new AbortController().signal));}
 assert.equal(seen[0].url,'https://example.test/v1/messages');assert.equal(seen[0].headers['x-api-key'],'secret');assert.equal(seen[0].headers.Authorization,undefined);assert.equal(seen[1].headers['x-goog-api-key'],'secret');assert.match(seen[1].url,/:streamGenerateContent\?alt=sse$/);assert.equal(seen[2].headers.Authorization,'Bearer secret');assert.equal(seen[3].url,'https://resource.openai.azure.com/openai/v1/responses');assert.equal(seen[3].headers['api-key'],'secret');assert.equal(seen[3].body.model,'deployment');}finally{globalThis.fetch=original;}
});
test('provider validation rejects credentials in insecure URLs and malformed identity settings',()=>{
 assert.throws(()=>validateProvider(p('anthropic',{baseUrl:'http://remote.test/v1',apiKeyEnv:'TOKEN'})),/HTTPS/);assert.throws(()=>validateProvider(p('openai',{apiKeyEnv:'bad\nkey'})),/environment/);assert.throws(()=>validateProvider(p('azure')),/openai\/v1/);assert.throws(()=>validateProvider(p('bedrock')),/region/);assert.throws(()=>validateProvider(p('vertex')),/project/);
 validateProvider(p('bedrock',{baseUrl:'',region:'us-east-1'}));validateProvider(p('vertex',{baseUrl:'',projectId:'my-project-123',location:'us-central1'}));assert.equal(publicProvider(p('openai',{apiKey:'secret'})).hasApiKey,true);assert.equal('apiKey' in publicProvider(p('openai',{apiKey:'secret'})),false);
 process.env.OPENCLAUDE_PROVIDER_TEST_KEY='environment-secret';try{assert.equal(providerCredential(p('gemini',{apiKeyEnv:'OPENCLAUDE_PROVIDER_TEST_KEY'})),'environment-secret');}finally{delete process.env.OPENCLAUDE_PROVIDER_TEST_KEY;}
 assert.throws(()=>providerCredential(p('gemini',{apiKeyEnv:'OPENCLAUDE_PROVIDER_TEST_KEY'})),/not set/);
});
test('configured enterprise model discovery does not imply authenticated cloud access',async()=>{
 const models=await listModels(p('bedrock',{baseUrl:'',region:'us-east-1',modelIds:['inference-profile-id']}));assert.equal(models[0].reportedCapabilities,false);assert.equal(models[0].id,'inference-profile-id');await assert.rejects(listModels(p('vertex',{baseUrl:''})),/exact model/);
 assert.ok(providerProfiles.some(profile=>profile.type==='bedrock'));assert.ok(providerProfiles.filter(profile=>profile.category==='regional').length>=5);assert.equal(new Set(providerProfiles.map(profile=>profile.id)).size,providerProfiles.length);
});
test('Bedrock SDK signs requests with AWS SigV4 and session credentials from its identity chain',async()=>{
 const previous=Object.fromEntries(['AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN','AWS_PROFILE'].map(key=>[key,process.env[key]]));
 let authorization='',session='',path='';
 const server=createServer((req,res)=>{authorization=String(req.headers.authorization??'');session=String(req.headers['x-amz-security-token']??'');path=req.url??'';req.resume();res.writeHead(403,{'Content-Type':'application/json','x-amzn-errortype':'AccessDeniedException'});res.end(JSON.stringify({message:'Test access denied'}));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address() as {port:number};
 delete process.env.AWS_PROFILE;process.env.AWS_ACCESS_KEY_ID='TESTACCESS';process.env.AWS_SECRET_ACCESS_KEY='test-secret';process.env.AWS_SESSION_TOKEN='test-session';
 try{await assert.rejects(collect(generate(p('bedrock',{baseUrl:`http://127.0.0.1:${address.port}`,region:'us-east-1'}),{model:'model-id',messages:[{role:'user',content:'Hello'}]},new AbortController().signal)),/Test access denied/);assert.match(authorization,/^AWS4-HMAC-SHA256 Credential=TESTACCESS\//);assert.match(authorization,/us-east-1\/bedrock\/aws4_request/);assert.equal(session,'test-session');assert.equal(path,'/model/model-id/converse-stream');}
 finally{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('Vertex uses ADC cloud-platform OAuth and project/location-specific model endpoints',async t=>{
 t.mock.method(GoogleAuth.prototype,'getAccessToken',async function(this:GoogleAuth){assert.deepEqual(Reflect.get(this,'scopes'),['https://www.googleapis.com/auth/cloud-platform']);return 'adc-access-token';});
 const regional=await vertexEndpoint(p('vertex',{projectId:'my-project-123',location:'us-central1'}),'gemini-test');assert.equal(regional.headers.Authorization,'Bearer adc-access-token');assert.equal(regional.url,'https://us-central1-aiplatform.googleapis.com/v1/projects/my-project-123/locations/us-central1/publishers/google/models/gemini-test:streamGenerateContent?alt=sse');
 const global=await vertexEndpoint(p('vertex',{projectId:'my-project-123',location:'global'}),'gemini-test');assert.match(global.url,/^https:\/\/aiplatform.googleapis.com\/v1\/projects\/my-project-123\/locations\/global\//);
});
