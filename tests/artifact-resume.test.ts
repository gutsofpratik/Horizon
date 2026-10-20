import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../server/storage/database.ts';
import {createTools} from '../server/tools/index.ts';
import {buildContext} from '../server/agent/context.ts';

test('an interrupted HTML draft survives restart and resumes in the same chat',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'artifact-resume-'));
 let store=new Store(join(directory,'state.sqlite'));
 const app:any={store,ephemeral:new Map(),root:process.cwd(),dataDirectory:directory};
 const events:any[]=[];
 const ctx:any={app,conversationId:'chat',runId:'first',signal:new AbortController().signal,emit:(type:string,data:any)=>events.push({type,data}),loadedSkills:new Map()};
 const invoke=(tools:any,name:string,args:any,runId='first',conversationId='chat')=>tools.execute({id:crypto.randomUUID(),name,arguments:args},{...ctx,runId,conversationId});
 try{
  let tools=createTools(app);store.put('runs',{id:'first',status:'running'});
  const start=await invoke(tools,'artifact_draft_start',{title:'Tracker',type:'html'});
  const id=start.data.draft_id;
  await invoke(tools,'artifact_draft_write',{draft_id:id,source:'<h1>checkpoint</h1>'});
  const concurrent=await invoke(tools,'artifact_draft_resume',{draft_id:id},'second');
  assert.equal(concurrent.status,'failed');
  store.put('runs',{id:'first',status:'cancelled'});store.close();
  store=new Store(join(directory,'state.sqlite'));app.store=store;app.ephemeral=new Map();tools=createTools(app);
  assert.ok(buildContext(app,{id:'chat',messages:[]})[0].content.includes(id));
  const foreign=await invoke(tools,'artifact_draft_resume',{draft_id:id},'foreign','other');
  assert.equal(foreign.status,'failed');
  const resumed=await invoke(tools,'artifact_draft_resume',{draft_id:id},'second');
  assert.equal(resumed.status,'succeeded');
  const read=await invoke(tools,'artifact_draft_read',{draft_id:id},'second');
  assert.equal(read.data.source,'<h1>checkpoint</h1>');
  const finish=await invoke(tools,'artifact_draft_finish',{draft_id:id},'second');
  assert.equal(finish.status,'succeeded');
  assert.equal(finish.data.artifact.source,'<h1>checkpoint</h1>');
  assert.equal(store.list('artifacts').length,1);
  assert.equal(events.filter(e=>e.type==='artifact.created').length,1);
  assert.equal((await invoke(tools,'artifact_draft_resume',{draft_id:id},'third')).status,'failed');
 }finally{store.close();await rm(directory,{recursive:true,force:true});}
});

test('incognito checkpoint source is never stored in SQLite',async()=>{
 const store=new Store(':memory:');const app:any={store,ephemeral:new Map(),root:process.cwd(),dataDirectory:process.cwd()};
 const ctx:any={app,conversationId:'private',runId:'private-run',incognito:true,signal:new AbortController().signal,emit:()=>{},loadedSkills:new Map()};
 const tools=createTools(app);
 try{
  const started=await tools.execute({id:'start',name:'artifact_draft_start',arguments:{title:'Private',type:'html'}},ctx);
  await tools.execute({id:'write',name:'artifact_draft_write',arguments:{draft_id:started.data.draft_id,source:'private-checkpoint-source'}},ctx);
  assert.equal(store.list('artifact_drafts').length,0);
  const finished=await tools.execute({id:'finish',name:'artifact_draft_finish',arguments:{draft_id:started.data.draft_id}},ctx);
  assert.equal(finished.status,'succeeded');assert.equal(store.list('artifacts').length,0);
 }finally{store.close();}
});
