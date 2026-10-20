import test from 'node:test';import assert from 'node:assert/strict';import {Store} from '../server/storage/database.ts';import {Agent} from '../server/agent/orchestrator.ts';import {createTools} from '../server/tools/index.ts';
test('posting a prompt returns immediately and emits loading before model preparation finishes',async()=>{
 const store=new Store(':memory:');const originalFetch=globalThis.fetch;let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);
 const app:any={store,root:process.cwd(),dataDirectory:'.local',ephemeral:new Map(),runtime:{health:async()=>({})}};
 store.put('providers',{id:'builtin',name:'Built-in',type:'openai',baseUrl:'http://127.0.0.1:3001/api/builtin/v1'});store.put('local_models',{id:'local',path:'test.gguf',configuration:{contextTokens:150000}});
 app.ephemeral.set('modelRuntime',{isReady:()=>false,select:async()=>held});
 globalThis.fetch=async()=>new Response(JSON.stringify({contextTokens:150000,outputTokens:150000,capabilities:[]}));
 const agent=new Agent(app,createTools(app));let run:any;
 try{run=await agent.start({content:'Hi',providerId:'builtin',model:'local',toolsEnabled:false,incognito:true});for(let attempt=0;attempt<100&&!agent.events(run.id).some((event:any)=>event.type==='message.started');attempt++)await new Promise(resolve=>setTimeout(resolve,10));
 const initial=agent.events(run.id).find((event:any)=>event.type==='message.started');assert.equal(initial.data.message.engineStage,'loading');assert.equal(agent.getRun(run.id).status,'running');
 agent.cancel(run.id);release();await agent.wait(run.id);assert.equal(agent.getRun(run.id).status,'cancelled');
 }finally{release();if(run)await agent.wait(run.id);globalThis.fetch=originalFetch;store.close();}
});
