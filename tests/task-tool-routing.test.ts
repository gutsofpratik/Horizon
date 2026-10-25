import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/storage/database.ts';
import {createTools} from '../server/tools/index.ts';
import {modelToolDefinitions,directDiscoveryMatches,continuationRequest} from '../server/tools/model-interface.ts';
import {makeTaskScope} from '../server/tools/task-routing.ts';
import {decideTool} from '../server/tools/policy.ts';
import {capabilityManifest} from '../server/tools/manifest.ts';
function fixture(){const store=new Store(':memory:');const app:any={store,root:process.cwd(),dataDirectory:'.local',ephemeral:new Map(),runtime:{ready:true}};app.ephemeral.set('documentRuntime',{availability:()=>null,snapshot:()=>({ready:true}),request:async()=>({files:[]})});const registry=createTools(app);const ctx:any={app,conversationId:'routing-test',runId:'routing-run',edition:'desktop',vision:true,approvalMode:'full',signal:new AbortController().signal,emit:()=>{},loadedSkills:new Map(),discoveredTools:new Set()};return {store,registry,ctx};}

test('deliverable plans, HTML presentations and local file opening retain execution tools',()=>{
 const {store,registry,ctx}=fixture();try{
  for(const request of ['Create a gym diet plan','Create me a presentation']){
   modelToolDefinitions(registry,ctx,request);
   assert.equal(decideTool(registry.tools.get('artifact_create')!,ctx,{}).allowed,true,request);
  }
  modelToolDefinitions(registry,ctx,'Open the HTML file');
  assert.equal(decideTool(registry.tools.get('browser_open_file')!,ctx,{}).allowed,true);
  ctx.taskMode='browser';modelToolDefinitions(registry,ctx,'Browse the deployment site');
  assert.equal(decideTool(registry.tools.get('web_search')!,ctx,{}).code,'WORKFLOW_TOOL_REQUIRED');
 }finally{store.close();}
});
test('task-scoped discovery and execution block unrelated functions and category bypasses',async()=>{
 const {store,registry,ctx}=fixture();try{
  const definitions=modelToolDefinitions(registry,ctx,'Search the web for current solar news');
  assert.ok(definitions.some(t=>t.function.name==='web_search'));assert.ok(!definitions.some(t=>/^(terminal|computer|git)_/.test(t.function.name)));
  assert.deepEqual(directDiscoveryMatches(registry,ctx,'terminal',['terminal_run']),[]);
  const blocked=await registry.execute({id:'blocked-direct',name:'terminal_run',arguments:{command:'echo hello'}},ctx);assert.equal(blocked.error.code,'TASK_TOOL_OUT_OF_SCOPE');
  const grouped=await registry.execute({id:'blocked-group',name:'shell',arguments:{action:'processes'}},ctx);assert.equal(grouped.error.code,'TASK_TOOL_OUT_OF_SCOPE');
  const discovered=await registry.execute({id:'discover',name:'discover_tools',arguments:{names:['terminal_run']}},ctx);assert.equal(discovered.data.tools.length,0);assert.equal(discovered.data.blocked[0].code,'TASK_TOOL_OUT_OF_SCOPE');
 }finally{store.close();}
});
test('coding, documents, media, explicit selections and followups retain needed families',()=>{
 const {store,registry,ctx}=fixture();try{
  modelToolDefinitions(registry,ctx,'Fix the TypeScript code in this repository and run tests');
  for(const name of ['files_read','code_search','symbol_search','code_test','git_diff'])assert.equal(decideTool(registry.tools.get(name)!,ctx,{}).allowed,true,name);
  assert.equal(decideTool(registry.tools.get('computer_click')!,ctx,{}).allowed,false);
  const revision=continuationRequest([{role:'user',content:'Create an Excel balance sheet'},{role:'user',content:'Make it blue and add a chart'}],'Make it blue and add a chart');
  const defs=modelToolDefinitions(registry,ctx,revision);assert.ok(defs.some(t=>t.function.name==='spreadsheet_create'));assert.ok(ctx.taskScope.families.includes('sheets'));
  assert.deepEqual(makeTaskScope('Search the web','browser').profiles,['browser']);
  assert.ok(makeTaskScope('/browser_open https://example.com').families.includes('browser'));
  assert.ok(makeTaskScope('Transcribe this audio and inspect video').families.includes('media'));
  assert.ok(makeTaskScope('hi').families.includes('memory'));assert.ok(!makeTaskScope('hi').families.includes('shell'));
  assert.deepEqual(makeTaskScope('Search for the best React and Python coding tutorials').profiles,['web']);
 }finally{store.close();}
});
test('new tools have real schemas and capability entries; latest discovered operation remains supplied',()=>{
 const {store,registry,ctx}=fixture();try{
  modelToolDefinitions(registry,ctx,'Work on source code in this repository');
  for(const name of ['files_list','files_read','files_write','files_patch','files_search','code_search','symbol_search','git_status','git_log','git_diff','code_format'])ctx.discoveredTools.add(name);
  assert.ok(modelToolDefinitions(registry,ctx,'Work on source code in this repository').some(t=>t.function.name==='code_format'));
  for(const name of ['database_execute','sql_query','document_ocr','audio_transcribe','media_ffmpeg','computer_ui_tree','task_create','network_upload','files_hash']){assert.ok(registry.tools.has(name),name);assert.ok(capabilityManifest(registry,{...ctx,taskScope:undefined}).some(f=>f.actions.some(a=>a.tool===name&&a.registered)),name);}
 }finally{store.close();}
});
test('read-only planning and model vision still constrain new operations',()=>{
 const {store,registry,ctx}=fixture();try{
  modelToolDefinitions(registry,ctx,'Inspect the database and system info');
  ctx.taskMode='plan';
  assert.equal(decideTool(registry.tools.get('sql_query')!,ctx,{}).allowed,true);
  assert.equal(decideTool(registry.tools.get('database_execute')!,ctx,{}).code,'PLAN_APPROVAL_REQUIRED');
  ctx.taskMode='computer';modelToolDefinitions(registry,ctx,'Use the computer');ctx.vision=false;
  assert.equal(decideTool(registry.tools.get('computer_ui_tree')!,ctx,{}).allowed,true);
  assert.equal(decideTool(registry.tools.get('computer_click')!,ctx,{}).code,'VISION_REQUIRED');
 }finally{store.close();}
});
