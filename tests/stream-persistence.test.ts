import test from 'node:test';import assert from 'node:assert/strict';import {Store} from '../server/storage/database.ts';import {Agent} from '../server/agent/orchestrator.ts';import {ToolRegistry} from '../server/tools/registry.ts';
test('streams text immediately while committing a burst in one ordered transaction',()=>{
 const store=new Store(':memory:');const app:any={store,root:process.cwd(),dataDirectory:'.local',ephemeral:new Map()};const agent=new Agent(app,new ToolRegistry(app));const run:any={id:'stream',sequence:0,events:[],controller:new AbortController()};let observed=0;
 agent.emitter.on(run.id,()=>observed++);
 try{
  for(let i=0;i<100;i++)agent.emit(run,'model.delta',{messageId:'a',text:String(i)});
  assert.equal(observed,100);assert.equal(store.events(run.id).length,0);
  agent.emit(run,'message.completed',{message:{id:'a',content:'complete'}});
  const saved=store.events(run.id);assert.equal(saved.length,101);assert.equal(saved.at(-1).type,'message.completed');assert.deepEqual(saved.map(item=>item.sequence),Array.from({length:101},(_,index)=>index+1));
 }finally{clearTimeout(run.persistTimer);store.close();}
});
