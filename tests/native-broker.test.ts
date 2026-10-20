import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeBroker} from '../server/runtime/native-broker.ts';
test('desktop broker authenticates, delivers once and returns actual tool results',async()=>{
 const broker=new NativeBroker();const token='a'.repeat(64);broker.connect(token,{terminal:true,browser:false});
 assert.throws(()=>broker.poll('b'.repeat(64)),/authentication/);
 const request=broker.request('terminal_run',{command:'pwd'},'chat-one',new AbortController().signal);
 const [command]=broker.poll(token);assert.equal(command.owner,'chat-one');assert.equal(broker.poll(token).length,0);
 broker.complete(token,command.id,{data:{job_id:'real-job'}});assert.deepEqual(await request,{job_id:'real-job'});
 assert.throws(()=>broker.complete(token,command.id,{data:{}}),/not pending/);
 broker.dispose();
});
test('cancelled tool requests cannot later be completed as successful',async()=>{
 const broker=new NativeBroker();const token='a'.repeat(64);broker.connect(token,{terminal:true,browser:false});
 const controller=new AbortController();const request=broker.request('terminal_run',{},'chat-one',controller.signal);
 const [command]=broker.poll(token);controller.abort();await assert.rejects(request,/cancelled/);
 assert.equal(broker.poll(token)[0].cancelId,command.id);assert.throws(()=>broker.complete(token,command.id,{data:{}}),/not pending/);broker.dispose();
});
test('closed terminal input is a lifecycle error rather than an unknown native failure',async()=>{
 const broker=new NativeBroker();const token='a'.repeat(64);broker.connect(token,{terminal:true,browser:false});
 const request=broker.request('terminal_stdin',{job_id:'finished',text:'x'},'chat-one',new AbortController().signal);
 const [command]=broker.poll(token);broker.complete(token,command.id,{error:'TERMINAL_EXITED: The terminal input pipe is closed; start a new session.'});
 await assert.rejects(request,(error:any)=>error.code==='TERMINAL_EXITED');broker.dispose();
});
test('stale computer screenshots request a fresh observation',async()=>{
 const broker=new NativeBroker();const token='a'.repeat(64);broker.connect(token,{terminal:false,browser:true});
 const request=broker.request('computer_click',{screen_id:'old'},'chat-one',new AbortController().signal);
 const [command]=broker.poll(token);broker.complete(token,command.id,{error:'Screenshot is stale; capture the screen again'});
 await assert.rejects(request,(error:any)=>error.code==='STALE_ELEMENT_REFERENCE'&&/fresh screenshot/.test(error.message));broker.dispose();
});
