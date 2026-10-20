import test from 'node:test';import assert from 'node:assert/strict';
import {Store} from '../server/storage/database.ts';import {createTools} from '../server/tools/index.ts';import {Agent} from '../server/agent/orchestrator.ts';
for(const content of ['Remember that I prefer concise answers','I prefer concise answers','I live in Pune','I am a vegetarian','My birthday is in June','I have a dog called Milo','My goal is to run a marathon'])test('persistent save is required for: '+content,async()=>{
 const store=new Store(':memory:');const app:any={store,ephemeral:new Map(),root:process.cwd(),dataDirectory:process.cwd()};store.put('providers',{id:'test',type:'ollama',baseUrl:'http://test'});let round=0;
 const agent=new Agent(app,createTools(app),async function*(_provider,request){round++;assert.equal(store.list('memories').length,1);assert.ok(request.messages[0].content.includes('Already saved'));yield {type:'content',text:'Got it.'};yield {type:'done'};});
 try{const run=await agent.start({content,model:'test',providerId:'test'});await agent.wait(run.id);assert.equal(agent.getRun(run.id).status,'completed');assert.equal(round,1);assert.equal(store.list('memories').length,1);assert.ok(content.includes(store.list('memories')[0].text));}finally{store.close();}
});

test('ambiguous memory request cannot abort an otherwise valid answer',async()=>{
 const store=new Store(':memory:'),app:any={store,ephemeral:new Map(),root:process.cwd(),dataDirectory:process.cwd()};store.put('providers',{id:'test',type:'ollama',baseUrl:'http://test'});
 const agent=new Agent(app,createTools(app),async function*(){yield {type:'content',text:'I need the specific fact.'};yield {type:'done'};});
 try{const run=await agent.start({content:'Remember this',model:'test',providerId:'test'});await agent.wait(run.id);assert.equal(agent.getRun(run.id).status,'completed');assert.match(store.get('conversations',run.conversationId)!.messages.at(-1).content,/Memory was not saved/);}finally{store.close();}
});

test('a corrected single-valued personal fact replaces its earlier saved value',async()=>{
 const store=new Store(':memory:'),app:any={store,ephemeral:new Map(),root:process.cwd(),dataDirectory:process.cwd()};store.put('providers',{id:'test',type:'ollama',baseUrl:'http://test'});
 const agent=new Agent(app,createTools(app),async function*(){yield {type:'content',text:'Understood.'};yield {type:'done'};});
 try{for(const content of ['I live in Pune','I live in Mumbai']){const run=await agent.start({content,model:'test',providerId:'test'});await agent.wait(run.id);assert.equal(agent.getRun(run.id).status,'completed');}assert.equal(store.list('memories').length,1);assert.equal(store.list('memories')[0].text,'I live in Mumbai');}finally{store.close();}
});

test('automatic saving respects privacy, negation, fiction and tool settings',async()=>{
 for(const [content,options,settings] of [
  ['I live in Pune',{incognito:true},{}],['I live in Pune',{useMemory:false},{}],['I live in Pune',{}, {memoryEnabled:false}],
  ['I live in Pune',{}, {enabledToolNames:['calculate']}],['Do not remember that I live in Pune',{},{}],
  ['Translate: I live in Pune',{},{}],['My password is abc123',{},{}]
 ] as [string,any,any][]){
  const store=new Store(':memory:'),app:any={store,ephemeral:new Map(),root:process.cwd(),dataDirectory:process.cwd()};store.put('providers',{id:'test',type:'ollama',baseUrl:'http://test'});store.put('settings',{id:'main',...settings});
  const agent=new Agent(app,createTools(app),async function*(){yield {type:'content',text:'Understood.'};yield {type:'done'};});
  try{const run=await agent.start({content,model:'test',providerId:'test',...options});await agent.wait(run.id);assert.equal(agent.getRun(run.id).status,'completed',content);assert.equal(store.list('memories').length,0,content);}finally{store.close();}
 }
});
test('malformed native tool JSON returns correction feedback without executing its defaults',async()=>{const store=new Store(':memory:');const app:any={store,ephemeral:new Map(),root:process.cwd(),dataDirectory:process.cwd()};store.put('providers',{id:'test',type:'ollama',baseUrl:'http://test'});let round=0;const agent=new Agent(app,createTools(app),async function*(_provider,request){if(++round===1)yield {type:'tool_call',id:'bad',name:'memory_save',arguments:{},argumentError:'Malformed JSON; correct the native call'};else if(round===2){assert.ok(request.messages.some(message=>message.content.includes('INVALID_TOOL_JSON')));assert.equal(store.list('memories').length,0);yield {type:'tool_call',id:'good',name:'memory_save',arguments:{text:'The user prefers brief answers'}};}else yield {type:'content',text:'Saved.'};yield {type:'done'};});try{const run=await agent.start({content:'Remember the preference from earlier',model:'test',providerId:'test'});await agent.wait(run.id);assert.equal(agent.getRun(run.id).status,'completed');assert.equal(store.list('memories').length,1);}finally{store.close();}});
