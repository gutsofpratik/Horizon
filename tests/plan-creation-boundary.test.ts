import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv/dist/2020.js';
import {Store} from '../server/storage/database.ts';
import {createTools} from '../server/tools/index.ts';
import {proposePlan,resolvePlanFromUser,planningLocked,planGate} from '../server/agent/plan-approval.ts';
import {specializeGateway} from '../server/tools/gateway.ts';
import {prepareCreationSkills} from '../server/skills/tool-guidance.ts';

function fixture(){const store=new Store(':memory:');const app:any={store,ephemeral:new Map(),root:process.cwd(),dataDirectory:'.local',runtime:{ready:true,request:async()=>({files:[]})}};app.ephemeral.set('documentRuntime',{availability:()=>null,snapshot:()=>({status:'ready',ready:true}),request:async()=>({files:[]})});store.put('settings',{id:'main',toolsEnabled:true,approvalMode:'full'});store.put('conversations',{id:'c',messages:[]});const controller=new AbortController();const ctx:any={app,conversationId:'c',runId:'r',taskMode:'plan',approvalMode:'full',signal:controller.signal,emit:()=>{},loadedSkills:new Map(),discoveredTools:new Set()};return {store,app,ctx,controller,tools:createTools(app)};}
test('plan gate survives a chat approval claim and Full access; only the exact UI approval unlocks writes',async()=>{
 const {store,app,ctx,tools}=fixture();let writes=0;tools.tools.get('files_write')!.handler=()=>{writes++;return {};};
 try{const promise=proposePlan({title:'Build workbook',tasks:['Create workbook','Style and inspect']},ctx);const gate=planGate(app,'c');assert.equal(planningLocked(ctx,{}),true);
  store.put('conversations',{id:'c',messages:[{role:'user',content:'I approved, proceed'}]});
  const blocked=await tools.execute({id:'before',name:'files_write',arguments:{path:'example.txt',text:'example'}},ctx);assert.equal(blocked.error.code,'PLAN_APPROVAL_REQUIRED');assert.equal(writes,0);
  assert.throws(()=>resolvePlanFromUser(app,{id:'c'},gate.planId,2,true));assert.equal(planningLocked(ctx,{}),true);
  resolvePlanFromUser(app,{id:'c'},gate.planId,1,true);const result:any=await promise;assert.equal(result.user_approval.actor,'user');assert.equal(result.user_approval.source,'plan_approval_button');assert.equal(planningLocked(ctx,{}),false);
  const executed=await tools.execute({id:'after',name:'files_write',arguments:{path:'example.txt',text:'example'}},ctx);assert.equal(executed.status,'succeeded');assert.equal(writes,1);
  assert.throws(()=>resolvePlanFromUser(app,{id:'c'},gate.planId,1,true));assert.equal(planningLocked({...ctx,runId:'different-run'},{}),true);
 }finally{store.close();}
});
test('requesting plan changes returns feedback through the tool and preserves the execution lock',async()=>{
 const {store,app,ctx}=fixture();try{const promise=proposePlan({title:'Draft',tasks:['Build']},ctx);const gate=planGate(app,'c');resolvePlanFromUser(app,{id:'c'},gate.planId,1,false,'Include PDF export');const result:any=await promise;assert.equal(result.user_approval.approved,false);assert.equal(result.user_approval.feedback,'Include PDF export');assert.equal(planningLocked({...ctx,taskMode:'chat'},{}),true);}finally{store.close();}
});
test('cancelled approval remains unapproved and can be approved from the saved UI state',async()=>{
 const {store,app,ctx,controller}=fixture();try{const promise=proposePlan({title:'Saved plan',tasks:['Build']},ctx);const gate=planGate(app,'c');controller.abort();await assert.rejects(promise);assert.equal(planningLocked(ctx,{}),true);const result=resolvePlanFromUser(app,{id:'c'},gate.planId,1,true);assert.equal(result.resumed,false);assert.equal(result.plan.approvedBy,'user');}finally{store.close();}
});
test('creation preloads its real skill and constrains nested workbook rows to arrays',async()=>{
 const {store,ctx,tools}=fixture();ctx.taskMode='chat';try{await prepareCreationSkills('Create a balance sheet in Excel',tools,ctx);assert.ok(ctx.loadedSkills.has('openclaude-spreadsheet-workflow'));const definitions=specializeGateway(tools,ctx,tools.definitions(undefined,false,ctx));const gateway=definitions.find(tool=>tool.function.name==='toolkit')!;const validate=new Ajv({strict:false}).compile(gateway.function.parameters);const valid={action:'call',name:'sheets',arguments:{action:'create',output_name:'balance.xlsx',sheets:[{name:'Balance',rows:[['Cash',0]]}]}};assert.equal(validate(valid),true,JSON.stringify(validate.errors));assert.equal(validate({...valid,arguments:JSON.stringify(valid.arguments)}),false);assert.equal(validate({...valid,arguments:{...valid.arguments,sheets:[{name:'Balance',rows:['Cash,0']}]}}),false);
 }finally{store.close();}
});
test('direct creation loads the workflow even when discovery was skipped; malformed JSON has no effects',async()=>{
 const {store,ctx,tools}=fixture();ctx.taskMode='chat';let creations=0;ctx.app.ephemeral.get('documentRuntime').request=async()=>{creations++;return {files:[]};};try{const result=await tools.execute({id:'create',name:'spreadsheet_create',arguments:{output_name:'balance.xlsx',sheets:[{name:'Balance',rows:[['Cash',0]]}]}},ctx);assert.equal(result.status,'succeeded');assert.equal(creations,1);assert.ok(ctx.loadedSkills.has('openclaude-spreadsheet-workflow'));const failed=await tools.execute({id:'broken',name:'toolkit',arguments:{action:'call',name:'sheets',arguments:'{"action":"create", "sheets":['}},ctx);assert.equal(failed.error.code,'INVALID_TOOL_JSON');assert.ok(failed.data.guidance);assert.equal(creations,1);}finally{store.close();}
});
