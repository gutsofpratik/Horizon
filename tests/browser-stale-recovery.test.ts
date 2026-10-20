import test from 'node:test';import assert from 'node:assert/strict';import {Store} from '../server/storage/database.ts';import {createTools} from '../server/tools/index.ts';
test('stale native browser action returns fresh observation without replaying a possibly changed target',async()=>{
 const store=new Store(':memory:');const calls:string[]=[];const app:any={store,root:process.cwd(),ephemeral:new Map()};
 app.ephemeral.set('nativeBridge',{kind:'tauri',ipcReady:true,browser:true,updated:Date.now(),tools:['browser_press','browser_snapshot']});
 app.ephemeral.set('tauriBroker',{request:async(name:string)=>{calls.push(name);if(name==='browser_press')throw Error('Error: Snapshot is stale; inspect the page again');return {tab_id:'tab',snapshot_id:'fresh',elements:[{ref:'2',text:'Next'}]};}});
 const ctx:any={app,edition:'desktop',mode:'chat',conversationId:'c',runId:'r',signal:new AbortController().signal,emit:()=>{}};
 try{const result=await createTools(app).execute({id:'press',name:'browser_press',arguments:{tab_id:'tab',snapshot_id:'old',ref:'1',key:'Enter'}},ctx);assert.equal(result.status,'failed');assert.equal(result.error.code,'STALE_ELEMENT_REFERENCE');assert.equal(result.data.snapshot.snapshot_id,'fresh');assert.deepEqual(calls,['browser_press','browser_snapshot']);}finally{store.close();}
});
