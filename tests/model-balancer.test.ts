import test from 'node:test';import assert from 'node:assert/strict';
import {ModelBalancer} from '../server/models/balancer.ts';
test('runs matching model requests in parallel without switching an active model',async()=>{
 let selected='',active=0;const actions:string[]=[];const releases:Array<()=>void>=[];
 const balance=new ModelBalancer({ready:(entry:any)=>selected===entry.id,capacity:()=>2,activate:async(entry:any)=>{assert.equal(active,0);selected=entry.id;actions.push('load:'+entry.id);}});
 const job=(id:string)=>balance.run({id},async()=>{active++;actions.push('start:'+id);await new Promise<void>(resolve=>releases.push(resolve));active--;return id;});
 const a=job('a'),b=job('a'),c=job('b');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(active,2);assert.deepEqual(actions,['load:a','start:a','start:a']);
 releases.shift()!();await a;assert.equal(selected,'a');releases.shift()!();await b;await new Promise(resolve=>setImmediate(resolve));assert.equal(selected,'b');releases.shift()!();await c;
});
test('cancels a waiting request immediately and never dispatches it',async()=>{
 const balance=new ModelBalancer({ready:()=>true,capacity:()=>1,activate:async()=>{}});let release!:()=>void;
 const first=balance.run({},()=>new Promise<void>(resolve=>release=resolve));await new Promise(resolve=>setImmediate(resolve));
 const abort=new AbortController();let dispatched=false;const second=balance.run({},async()=>{dispatched=true;},abort.signal);abort.abort();
 await assert.rejects(second,/cancelled/i);assert.equal(dispatched,false);release();await first;assert.equal(balance.snapshot().queued,0);
});
