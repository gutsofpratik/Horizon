import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/storage/database.ts';
import {MessageQueue} from '../server/agent/message-queue.ts';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('cancellation while start is pending remains cancelled and aborts the assigned run',async()=>{
 const store=new Store(':memory:');let resolve!:(run:any)=>void;const cancelled:string[]=[];const agent:any={conversation:()=>({id:'chat'}),getRun:()=>undefined,start:()=>new Promise(done=>resolve=done),cancel:(id:string)=>cancelled.push(id)};const queue=new MessageQueue({store} as any,agent);
 try{const job=queue.enqueue({conversationId:'chat',content:'Do work'});queue.cancel('chat',job.queueId);resolve({id:'run'});await flush();assert.equal(queue.list('chat')[0].status,'cancelled');assert.deepEqual(cancelled,['run']);queue.settled({id:'run',conversationId:'chat'},'cancelled');assert.equal(queue.list('chat')[0].status,'cancelled');}finally{queue.close();store.close();}
});
test('start failure cannot overwrite a cancellation made during dispatch',async()=>{
 const store=new Store(':memory:');let reject!:(error:Error)=>void;const agent:any={conversation:()=>({id:'chat'}),getRun:()=>undefined,start:()=>new Promise((_done,fail)=>reject=fail)};const queue=new MessageQueue({store} as any,agent);
 try{const job=queue.enqueue({conversationId:'chat',content:'Do work'});queue.cancel('chat',job.queueId);reject(new Error('Provider failed'));await flush();assert.equal(queue.list('chat')[0].status,'cancelled');}finally{queue.close();store.close();}
});
