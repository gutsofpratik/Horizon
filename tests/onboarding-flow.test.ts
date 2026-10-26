import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {Store} from '../server/storage/database.ts';
import {registerOnboarding} from '../server/runtime/onboarding.ts';
import {parseOnboardingMemories} from '../server/runtime/onboarding-memory.ts';
import {modelParameterBillions} from '../server/models/hardware.ts';

test('memory import accepts exported JSON and plain facts without executing content',()=>{
 assert.deepEqual(parseOnboardingMemories('```json\n{"memories":["I use metric units",{"text":"I like concise replies"},"I use metric units"]}\n```'),['I use metric units','I like concise replies']);
 assert.deepEqual(parseOnboardingMemories('- I prefer tea\n2. I am learning piano'),['I prefer tea','I am learning piano']);
 assert.throws(()=>parseOnboardingMemories('{"memories":["incomplete"'),/incomplete/);
 assert.throws(()=>parseOnboardingMemories('{"memories":[{"tool":"shell"}]}'),/plain text/);
 assert.throws(()=>parseOnboardingMemories(JSON.stringify({memories:Array.from({length:1001},(_,i)=>'fact'+i)})),/1,000 memories/);
});
test('memory review is read-only, imports deduplicate, and onboarding persists without a model',async()=>{
 const app=Fastify(),store=new Store(':memory:');
 store.put('settings',{id:'main',userName:''});
 registerOnboarding(app,{store,ephemeral:new Map()} as any);
 try{
  await app.inject({method:'POST',url:'/api/onboarding/details',payload:{name:'Demo',age:25}});
  assert.equal(store.get('settings','main')?.userAge,25);
  const count=store.list('memories').length;
  const review=await app.inject({method:'POST',url:'/api/onboarding/memories',payload:{text:'{"memories":["I prefer tea"]}',preview:true}});
  assert.deepEqual(review.json().memories,['I prefer tea']);assert.equal(store.list('memories').length,count);
  const first=await app.inject({method:'POST',url:'/api/onboarding/memories',payload:{text:'I prefer tea'}});
  const second=await app.inject({method:'POST',url:'/api/onboarding/memories',payload:{text:'I prefer tea'}});
  assert.equal(first.json().saved,1);assert.equal(second.json().saved,0);
  assert.equal((await app.inject('/api/onboarding')).json().step,3);
  const finish=await app.inject({method:'POST',url:'/api/onboarding/complete',payload:{skipped:true}});
  assert.equal(finish.json().completed,true);
 }finally{await app.close();store.db.close();}
});
test('model size estimates use total parameters rather than MoE active parameters',()=>{
 assert.equal(modelParameterBillions('publisher/Qwen3.5-35B-A3B-GGUF'),35);
 assert.equal(modelParameterBillions('publisher/model-1.5B-instruct'),1.5);
 assert.equal(modelParameterBillions('publisher/unknown'),null);
});
