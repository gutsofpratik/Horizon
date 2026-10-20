import test from 'node:test';import assert from 'node:assert/strict';import {Store} from '../server/storage/database.ts';import {needsApproval,requestApproval,resolveApproval,pendingApprovals} from '../server/tools/approvals.ts';
test('approval profiles distinguish reads, local drafts and external control',()=>{
 assert.equal(needsApproval('browser_click','ask'),true);assert.equal(needsApproval('browser_snapshot','ask'),false);
 assert.equal(needsApproval('artifact_create','auto'),false);assert.equal(needsApproval('computer_click','auto'),true);
 assert.equal(needsApproval('terminal_run','full'),false);assert.equal(needsApproval('artifact_create','ask'),true);
});
test('pending approval blocks execution until the user resolves the exact call',async()=>{
 const app:any={store:new Store(':memory:'),ephemeral:new Map()};const controller=new AbortController(),events:any[]=[];const ctx:any={app,runId:'r',conversationId:'c',signal:controller.signal,emit:(type:any,data:any)=>events.push({type,data})};
 try{let continued=false;const wait=requestApproval('terminal_run',{command:'git status',apiKey:'DO_NOT_EXPOSE'},ctx).then(()=>{continued=true;});await Promise.resolve();assert.equal(continued,false);const [record]=pendingApprovals(app,'r');assert.ok(!JSON.stringify(record).includes('DO_NOT_EXPOSE'));assert.throws(()=>resolveApproval(app,'other',record.id,true));resolveApproval(app,'r',record.id,true);await wait;assert.equal(continued,true);assert.deepEqual(pendingApprovals(app,'r'),[]);}finally{app.store.close();}
});
test('cancellation and denial never grant approval',async()=>{
 const app:any={store:new Store(':memory:'),ephemeral:new Map()},controller=new AbortController();const ctx:any={app,runId:'r',conversationId:'c',signal:controller.signal,emit:()=>{}};
 try{const promise=requestApproval('computer_click',{x:2,y:3},ctx);const [record]=pendingApprovals(app,'r');resolveApproval(app,'r',record.id,false);await assert.rejects(promise,(e:any)=>e.code==='APPROVAL_DENIED');const aborted=requestApproval('computer_key',{keys:['ENTER']},ctx);controller.abort();await assert.rejects(aborted,(e:any)=>e.code==='CANCELLED');assert.deepEqual(pendingApprovals(app,'r'),[]);}finally{app.store.close();}
});
