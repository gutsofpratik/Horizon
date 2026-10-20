import test from 'node:test';import assert from 'node:assert/strict';import {responseActivities} from '../src/chat/response-activities.ts';
test('saved responses retain their own search queries and tool results across later turns',()=>{
 const all=[{id:'a',tool_calls:[{id:'search',function:{name:'web_search',arguments:'{"query":"original query"}'}}]},{id:'t',role:'tool',tool_call_id:'search',content:'{"status":"succeeded","data":{"sources":[]}}'},{id:'other',tool_calls:[{id:'later',function:{name:'web_search',arguments:{query:'later query'}}}]}];
 const result=responseActivities({messageIds:['a']},all);assert.equal(result.length,1);assert.equal(result[0].arguments.query,'original query');assert.equal(result[0].result.status,'succeeded');
 const live=responseActivities({messageIds:['a'],runId:'run'},all,[{runId:'run',callId:'search',name:'web_search',result:{status:'failed'}},{runId:'run',callId:'fetch',name:'web_fetch',arguments:{url:'https://example.com'}},{runId:'other',callId:'unrelated',name:'web_search',arguments:{query:'wrong branch'}}]);assert.equal(live.length,2);assert.equal(live[0].arguments.query,'original query');assert.equal(live[0].result.status,'failed');
});

test('gateway calls render only the leaf tool once and hide discovery wrappers',()=>{
 const all=[{id:'a',runId:'run',tool_calls:[{id:'discover',function:{name:'toolkit',arguments:{action:'discover',query:'extract'}}},{id:'outer',function:{name:'toolkit',arguments:{action:'call',name:'document_extract',arguments:{file_id:'pdf'}}}}]},{role:'tool',tool_call_id:'discover',content:JSON.stringify({status:'succeeded',data:{tools:[]}})},{role:'tool',tool_call_id:'outer',content:JSON.stringify({status:'succeeded',data:{called_tool:'document_extract',activity_call_id:'leaf'}})}];
 const tools=responseActivities({messageIds:['a'],runId:'run'},all,[{messageId:'a',runId:'run',callId:'leaf',name:'document_extract',arguments:{file_id:'pdf'},result:{status:'succeeded'}}]);assert.equal(tools.length,1);assert.equal(tools[0].name,'document_extract');assert.equal(tools[0].arguments.file_id,'pdf');
});
