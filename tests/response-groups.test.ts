import test from 'node:test';import assert from 'node:assert/strict';
import {responseGroups} from '../src/chat/response-groups.ts';

test('one model run presents one continuous response across thinking and tool rounds',()=>{
 const rounds=[{id:'user',role:'user',content:'Research'},{id:'a1',role:'assistant',runId:'run',reasoning:'Search first',content:'',status:'completed'},{id:'a2',role:'assistant',runId:'run',reasoning:'Read source',content:'Checking the source.',status:'completed'},{id:'a3',role:'assistant',runId:'run',reasoning:'Summarize',content:'Final answer',status:'generating'}];
 const groups=responseGroups(rounds,'run');assert.equal(groups.length,2);assert.equal(groups[1].reasoning,'Search first\n\nRead source\n\nSummarize');assert.equal(groups[1].content,'Checking the source.\n\nFinal answer');assert.equal(groups[1].renderKey,'a1');assert.equal(groups[1].firstMessageId,'a1');assert.equal(groups[1].id,'a3');assert.equal(groups[1].status,'generating');
 const between=responseGroups(rounds.slice(0,3),'run');assert.equal(between[1].status,'generating');assert.equal(between[1].renderKey,groups[1].renderKey);
});
test('grouping respects user turns and distinct runs and keeps completed responses completed',()=>{const input=[{id:'a',role:'assistant',runId:'one',reasoning:'First',status:'completed'},{id:'b',role:'assistant',runId:'two',reasoning:'Second',status:'completed'},{id:'u',role:'user'},{id:'c',role:'assistant',runId:'two',content:'Third',status:'completed'}];assert.equal(responseGroups(input).length,4);assert.equal(responseGroups(input)[0].status,'completed');});
