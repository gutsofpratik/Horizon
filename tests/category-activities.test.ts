import test from 'node:test';import assert from 'node:assert/strict';import {responseActivities} from '../src/chat/response-activities.ts';
test('category calls merge with their live leaf without a phantom preparing activity',()=>{
 const all=[{id:'a',tool_calls:[{id:'outer',function:{name:'browser',arguments:{action:'tabs',operation:'list'}}}]}];
 const live=[{runId:'r',messageId:'a',callId:'outer',name:'browser',arguments:{action:'tabs',operation:'list'}},{runId:'r',messageId:'a',callId:'leaf',name:'browser_tabs',arguments:{action:'list'},result:{status:'succeeded'}}];
 const result=responseActivities({messageIds:['a'],runId:'r'},all,live);assert.equal(result.length,1);assert.equal(result[0].callId,'leaf');assert.equal(result[0].name,'browser_tabs');assert.equal(result[0].result.status,'succeeded');
});
test('saved nested category result retains the actual action arguments',()=>{
 const all=[{id:'a',tool_calls:[{id:'outer',function:{name:'toolkit',arguments:{action:'call',name:'artifact',arguments:{action:'write',draft_id:'d',content:'abc'}}}}]},{role:'tool',tool_call_id:'outer',content:JSON.stringify({status:'succeeded',data:{called_tool:'artifact_draft_write',activity_call_id:'leaf'}})}];
 const result=responseActivities({messageIds:['a']},all);assert.equal(result.length,1);assert.equal(result[0].name,'artifact_draft_write');assert.deepEqual(result[0].arguments,{draft_id:'d',content:'abc'});
});
