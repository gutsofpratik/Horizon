import test from 'node:test';import assert from 'node:assert/strict';import {deliverableIntent} from '../server/agent/deliverable-intent.ts';
test('presentation topic and approval retain the unfinished deliverable request',()=>{
 const messages=[{role:'user',content:'create me a presentation'},{role:'assistant',content:'What topic?'},{role:'user',content:'presenttation on why ppl is on debt'},{role:'assistant',content:'Let me build an HTML presentation for you!'},{role:'user',content:'okie'}];
 const result=deliverableIntent(messages);assert.equal(result.required,true);assert.match(result.task,/why ppl is on debt/);
 assert.equal(deliverableIntent([...messages.slice(0,-1),{role:'user',content:'continue”'}]).required,true);
});
test('completed output and a new unrelated question do not force another artifact',()=>{
 const request={role:'user',content:'Create a presentation about debt'};
 assert.equal(deliverableIntent([request,{role:'tool',content:JSON.stringify({status:'succeeded',artifacts:[{id:'a'}]})},{role:'user',content:'okie'}]).required,false);
 assert.equal(deliverableIntent([request,{role:'assistant',content:'What topic?'},{role:'user',content:'What is 17 times 23?'}]).required,false);
 assert.equal(deliverableIntent([request,{role:'user',content:'cancel'}]).required,false);
 assert.equal(deliverableIntent([{role:'user',content:'Explain how to create a presentation'}]).required,false);
});
