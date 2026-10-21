import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Store} from '../server/storage/database.ts';import {createTools} from '../server/tools/index.ts';import {WebBrowserRuntime} from '../server/browser/web.ts';import {toolGuide} from '../server/tools/guidance.ts';import {relevantDefinitions} from '../server/tools/discovery.ts';
import {groupForLeaf,groupAction} from '../server/tools/groups.ts';
import {buildContext} from '../server/agent/context.ts';
test('workspace HTML and saved artifacts open as real inspectable browser tabs, with working JavaScript',async()=>{
 const dataDirectory=mkdtempSync(join(tmpdir(),'browser-file-')),store=new Store(':memory:'),browser=new WebBrowserRuntime();const app:any={store,dataDirectory,root:process.cwd(),ephemeral:new Map([['webBrowser',browser]])};const registry=createTools(app),events:any[]=[];const ctx:any={app,edition:'web',conversationId:'chat',runId:'test',signal:new AbortController().signal,emit:(type:string,data:any)=>events.push({type,data}),loadedSkills:new Map(),vision:false};let serial=0;const call=(name:string,args:any)=>{const category=groupForLeaf(name);return registry.execute({id:String(++serial),name:category?'toolkit':name,arguments:category?{action:'call',name:category,arguments:{action:groupAction(name),...args}}:args},ctx);};
 try{
  const written=await call('files_write',{path:'index.html',text:'<!doctype html><title>Local app</title><input aria-label="Name"><button onclick="document.querySelector(\'p\').textContent=document.querySelector(\'input\').value">Save</button><p>Initial</p>'});assert.equal(written.status,'succeeded');
  const opened=await call('browser_open_file',{path:'index.html'});assert.equal(opened.status,'succeeded',JSON.stringify(opened.error));assert.match(opened.data.snapshot.url,/workspace\.openclaude\.invalid/);assert.equal(events.at(-2)?.type==='browser.open_requested'||events.some(event=>event.type==='browser.open_requested'&&event.data.alreadyOpen===true),true);
  const snapshot=opened.data.snapshot,input=snapshot.elements.find((element:any)=>element.name==='Name');const filled=await call('browser_fill',{tab_id:snapshot.tab_id,snapshot_id:snapshot.snapshot_id,ref:input.ref,value:'Actual local HTML'});assert.equal(filled.status,'succeeded');const observed=filled.data.snapshot,button=observed.elements.find((element:any)=>element.name==='Save');const clicked=await call('browser_click',{tab_id:observed.tab_id,snapshot_id:observed.snapshot_id,ref:button.ref});assert.match(clicked.data.snapshot.text,/Actual local HTML/);
  const byId=await call('browser_open_file',{file_id:written.files[0].id});assert.equal(byId.status,'succeeded');
  const created=await call('artifact_create',{title:'HTML artifact',type:'html',source:'<h1>Existing artifact</h1>'});const artifact=await call('browser_open_file',{artifact_id:created.data.artifact.id});assert.match(artifact.data.snapshot.text,/Existing artifact/);
  assert.equal((await call('browser_open_file',{path:'../outside.html'})).error.code,'PATH_OUTSIDE_WORKSPACE');assert.equal((await call('browser_open_file',{path:'index.html',file_id:written.files[0].id})).error.code,'INVALID_ARGUMENTS');
  const foreign={...ctx,conversationId:'other'};const denied=await registry.execute({id:'foreign',name:'browser',arguments:{action:'open_file',file_id:written.files[0].id}},foreign);assert.equal(denied.error.code,'FILE_NOT_FOUND');
  const discovered=await registry.execute({id:'discover-browser',name:'toolkit',arguments:{action:'discover',name:'browser',tool_action:'open_file'}},ctx);assert.equal(discovered.status,'succeeded');const category=discovered.data.tools.find((tool:any)=>tool.name==='browser');assert.ok(JSON.stringify(category.parameters).includes('open_file'));assert.ok(!registry.catalog().some(tool=>tool.name==='browser_open_file'));
 }finally{await browser.dispose();store.close();rmSync(dataDirectory,{recursive:true,force:true});}
});
test('tool operating guide exposes actionable categories and defers schema discovery without leaf leakage',()=>{
 const store=new Store(':memory:');const app:any={store,dataDirectory:'.',root:process.cwd(),ephemeral:new Map()};const registry=createTools(app);const ctx:any={app,edition:'web',conversationId:'chat',signal:new AbortController().signal,vision:false};
 try{
  const initial=relevantDefinitions(registry.definitions(undefined,false,ctx),'Open the saved HTML in the browser','chat'),guide=toolGuide(registry.tools.values(),ctx,initial);
  for(const tool of initial)assert.ok(guide.includes(tool.function.name+': Required arguments:'),tool.function.name+' is missing its operating schema');
  assert.match(guide,/Available on demand/);assert.match(guide,/browser: Required arguments:/);assert.match(guide,/Native terminal and computer control are available in Horizon Desktop/);
  assert.ok(!guide.includes('browser_open_file:'));assert.ok(!guide.includes('artifact_create:'));
  const browser=initial.find(tool=>tool.function.name==='browser')!;assert.ok(browser);assert.match(JSON.stringify(browser.function.parameters),/OPEN an existing file\/artifact/);assert.ok(initial.some(tool=>tool.function.name==='discover_tools'));
  const prompt=buildContext(app,{id:'chat',messages:[{role:'user',content:'Open the saved HTML'}]},guide,150000)[0].content;assert.match(prompt,/browser: Required arguments:/);assert.ok(!prompt.includes('browser_open_file:'));
 }finally{store.close();}
});
