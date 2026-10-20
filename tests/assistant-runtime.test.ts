import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/storage/database.ts';
import {createTools} from '../server/tools/index.ts';
import {Agent} from '../server/agent/orchestrator.ts';

test('assistant defaults select provider/model, inject guidance and narrow offered tools without granting access',async()=>{
 const store=new Store(':memory:');const app:any={store,root:process.cwd(),dataDirectory:'.local',ephemeral:new Map()};
 store.put('providers',{id:'assistant-provider',name:'Fixture',type:'openai',baseUrl:'http://fixture.invalid'});
 store.put('settings',{id:'main',providerId:'missing-default',model:'wrong-model',toolsEnabled:true,memoryEnabled:false});
 store.put('assistants',{id:'reviewer',name:'Reviewer',instructions:'ASSISTANT_GUIDANCE_FIXTURE: inspect before making claims.',providerId:'assistant-provider',model:'selected-model',skillIds:[],toolNames:['files_read']});
 store.put('conversations',{id:'chat',title:'Review',assistantId:'reviewer',messages:[],useMemory:false});
 const agent=new Agent(app,createTools(app),async function*(_provider:any,request:any){assert.equal(_provider.id,'assistant-provider');assert.equal(request.model,'selected-model');assert.ok(request.tools.every((tool:any)=>tool.function.name==='files_read'));assert.match(request.messages[0].content,/ASSISTANT_GUIDANCE_FIXTURE/);yield {type:'content',text:'Ready to inspect the code.'};yield {type:'done'};});
 try{const run=await agent.start({conversationId:'chat',content:'Inspect the code repository.'});await agent.wait(run.id);assert.equal(agent.getRun(run.id).status,'completed',agent.getRun(run.id).error);}finally{store.close();}
});

test('native provider replay metadata persists across conversation turns',async()=>{
 const store=new Store(':memory:');const app:any={store,root:process.cwd(),dataDirectory:'.local',ephemeral:new Map()};
 store.put('providers',{id:'native',name:'Fixture',type:'anthropic',baseUrl:'http://fixture.invalid'});store.put('settings',{id:'main',providerId:'native',model:'fixture',memoryEnabled:false,toolsEnabled:false});let rounds=0;
 const metadata={anthropic:[{type:'text',text:'Hello'},{type:'thinking',thinking:'native fixture',signature:'signature-fixture'}]};
 const agent=new Agent(app,createTools(app),async function*(_provider:any,request:any){if(rounds++)assert.deepEqual(request.messages.find((message:any)=>message.role==='assistant'&&message.content==='Hello')?.providerData,metadata);yield {type:'content',text:'Hello'};yield {type:'provider_metadata',providerData:metadata};yield {type:'done'};});
 try{const first=await agent.start({content:'hi'});await agent.wait(first.id);const second=await agent.start({conversationId:first.conversationId,content:'How are you?'});await agent.wait(second.id);assert.equal(agent.getRun(second.id).status,'completed',agent.getRun(second.id).error);assert.equal(rounds,2);}finally{store.close();}
});
