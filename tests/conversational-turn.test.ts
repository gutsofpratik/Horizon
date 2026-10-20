import test from 'node:test';import assert from 'node:assert/strict';
import {isConversationalTurn} from '../server/agent/conversational-turn.ts';
import {Agent} from '../server/agent/orchestrator.ts';import {Store} from '../server/storage/database.ts';import {createTools} from '../server/tools/index.ts';
test('only standalone social messages take the lightweight path',()=>{
 for(const content of ['hi','hi lol','hi lool','hey haha','hello lmao','How are you?','Hey, how are you doing?','Thank you!','how aree u','hii','heyyy bro','how r u?','how u doing','hellooo','thanks bro','how are youuu'])assert.equal(isConversationalTurn({content}),true,content);
 for(const content of ['Hi, search for news','thanks, save this to memory','continue','yes','/browser_tabs','@frontend-design','How are you handling my files?','heyyy bro open the browser','how r u handling my files','hi /web_search','hi @frontend-design'])assert.equal(isConversationalTurn({content}),false,content);
 assert.equal(isConversationalTurn({content:'hi',attachments:[{id:'file'}]}),false);
});
test('social replies keep identity, memory and thinking without tool schemas or Docker checks',async()=>{
 const store=new Store(':memory:');let checks=0;let captured:any;
 const app:any={store,root:process.cwd(),ephemeral:new Map(),runtime:{ready:false,health:async()=>{checks++;}}};
 store.put('providers',{id:'test',type:'ollama',baseUrl:'http://test',name:'Test'});store.put('settings',{id:'main',userName:'Pratik',thinking:true});store.put('memories',{id:'preference',text:'Prefers concise replies.'});
 const agent=new Agent(app,createTools(app),async function*(_provider,request){captured=request;yield {type:'reasoning',text:'A brief greeting.'};yield {type:'content',text:'Doing well, Pratik!'};yield {type:'done'};});
 try{const run=await agent.start({content:'How are you?',providerId:'test',model:'test'});await agent.wait(run.id);assert.equal(agent.getRun(run.id).status,'completed');assert.equal(checks,0);assert.deepEqual(captured.tools,[]);assert.equal(captured.thinking,true);assert.ok(captured.messages[0].content.includes('Pratik'));assert.ok(captured.messages[0].content.includes('Prefers concise replies.'));assert.ok(captured.messages[0].content.length<5000);assert.ok(captured.messages.some((m:any)=>m.role==='user'&&m.content==='How are you?'));}finally{store.close();}
});

