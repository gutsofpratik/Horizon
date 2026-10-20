import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../server/storage/database.ts';
import {createTools} from '../server/tools/index.ts';
import {loadCatalog,readSkill} from '../server/skills/catalog.ts';
import {buildContext} from '../server/agent/context.ts';

async function fixture(){
 const directory=await mkdtemp(join(tmpdir(),'openclaude-extension-'));
 const store=new Store(join(directory,'state.sqlite'));
 const app:any={store,root:process.cwd(),dataDirectory:directory,ephemeral:new Map()};
 const ctx:any={app,conversationId:'chat',runId:'run',signal:new AbortController().signal,loadedSkills:new Map(),emit:()=>{}};
 let registry=createTools(app),sequence=0;
 return {app,ctx,store,call:(name:string,args:any,scope=ctx)=>registry.execute({id:'call-'+ ++sequence,name,arguments:args},scope),restart:()=>{store.close();app.store=new Store(join(directory,'state.sqlite'));registry=createTools(app);},close:async()=>{app.store.close();await rm(directory,{recursive:true,force:true});}};
}

test('durable memories deduplicate, paginate past 100 records and recall relevant older facts',async()=>{
 const f=await fixture();try{
  const first=await f.call('memory_save',{text:'My telescope is the Celestara 8',global:true});
  const duplicate=await f.call('memory_save',{text:'My telescope is the Celestara 8',global:true});
  assert.equal(first.data.memory.id,duplicate.data.memory.id);
  for(let i=0;i<125;i++)f.store.put('memories',{id:'fact-'+i,text:'Archive fact '+i});
  const page=await f.call('memory_search',{query:'',offset:100,limit:20});
  assert.equal(page.data.memories.length,20);assert.equal(page.data.total,126);assert.equal(page.data.next_offset,120);
  const chat={id:'chat',headId:'user',messages:[{id:'user',role:'user',content:'What telescope do I own?',parentId:null}]};
  assert.match(buildContext(f.app,chat)[0].content,/Celestara/);
  const hidden=buildContext(f.app,{...chat,useMemory:false})[0].content;assert.doesNotMatch(hidden,/Celestara/);
  f.restart();const found=await f.call('memory_search',{query:'Celestara'});assert.equal(found.data.memories[0].id,first.data.memory.id);
 }finally{await f.close();}
});

test('legacy memory note argument is normalized without bypassing validation',async()=>{
 const f=await fixture();try{
  const saved=await f.call('memory_save',{note:'My favorite color is blue'});assert.equal(saved.status,'succeeded');assert.equal(saved.data.memory.text,'My favorite color is blue');
  const ambiguous=await f.call('memory_save',{note:'different',text:'original'});assert.equal(ambiguous.status,'failed');
 }finally{await f.close();}
});

test('skill authoring creates an installed reusable skill and requires versioned edits',async()=>{
 const f=await fixture();try{
  const created=await f.call('skill_create',{name:'test-workflow',description:'Use to verify calculator workflows',instructions:'Use calculate to check arithmetic.'});
  assert.equal(created.status,'succeeded');const skill=created.data.skill;
  assert.ok((await loadCatalog(f.app)).some(s=>s.id===skill.id&&s.installed&&s.enabled));
  assert.equal((await f.call('skill_load',{skill_id:skill.id})).status,'succeeded');
  assert.match((await readSkill(f.app,skill.id)).instructions,/check arithmetic/);
  const edited=await f.call('skill_update',{skill_id:skill.id,expected_version:skill.version,name:'test-workflow',description:'Use to verify arithmetic',instructions:'Verify the numeric result before reporting.'});
  assert.equal(edited.status,'succeeded');assert.notEqual(edited.data.skill.version,skill.version);
  const stale=await f.call('skill_update',{skill_id:skill.id,expected_version:skill.version,name:'test-workflow',description:'stale',instructions:'stale'});assert.equal(stale.error.code,'SKILL_CONFLICT');
  const privateCreate=await f.call('skill_create',{name:'private',description:'private',instructions:'private'},{...f.ctx,incognito:true});assert.equal(privateCreate.status,'failed');
  const authors=(await loadCatalog(f.app)).filter(s=>['openclaude-skill-author','openclaude-tool-author'].includes(s.id));assert.equal(authors.length,2);assert.ok(authors.every(s=>s.installed));
 }finally{await f.close();}
});

test('model-created tools survive restart, use typed inputs and enforce leaf permissions',async()=>{
 const f=await fixture();try{
  const created=await f.call('custom_tool_create',{name:'user_arithmetic',description:'Evaluate a supplied numeric expression',parameters:[{name:'expression',type:'string',description:'Numeric expression'}],steps:[{id:'answer',tool:'calculate',arguments:{expression:{$input:'expression'}}}]});
  assert.equal(created.status,'succeeded');
  assert.equal((await f.call('user_arithmetic',{expression:'6*7'})).data.output.result,42);
  assert.equal((await f.call('user_arithmetic',{expression:3})).error.code,'INVALID_ARGUMENTS');
  f.restart();
  const discovered=await f.call('toolkit',{action:'discover',name:'user_arithmetic'});assert.equal(discovered.data.tools[0].name,'user_arithmetic');
  assert.equal((await f.call('user_arithmetic',{expression:'8*8'})).data.output.result,64);
  f.app.store.put('settings',{id:'main',enabledToolNames:['user_arithmetic']});
  const blocked=await f.call('user_arithmetic',{expression:'8*9'});assert.equal(blocked.status,'failed');assert.equal(blocked.data.failed_step,'answer');assert.equal(blocked.data.cause.code,'TOOL_DISABLED');
 }finally{await f.close();}
});

test('custom tools cannot recurse, overwrite builtins, persist privately or conceal failed steps',async()=>{
 const f=await fixture();try{
  const spec={name:'user_sample',description:'Calculate twice',parameters:[],steps:[{id:'one',tool:'calculate',arguments:{expression:'2+2'}},{id:'two',tool:'calculate',arguments:{expression:{$step:'one',path:'result'}}}]};
  assert.equal((await f.call('custom_tool_create',{...spec,name:'calculate'})).status,'failed');
  assert.equal((await f.call('custom_tool_create',{...spec,steps:[{id:'one',tool:'toolkit',arguments:{}}]})).status,'failed');
  assert.equal((await f.call('custom_tool_create',spec,{...f.ctx,incognito:true})).status,'failed');
  assert.equal((await f.call('custom_tool_create',spec)).status,'succeeded');
  const failed=await f.call('user_sample',{});assert.equal(failed.status,'failed');assert.equal(failed.data.failed_step,'two');assert.equal(failed.data.completed_steps.length,1);
 }finally{await f.close();}
});
