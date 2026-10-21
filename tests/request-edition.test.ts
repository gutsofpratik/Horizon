import test from 'node:test';
import assert from 'node:assert/strict';
import {requestEdition} from '../server/runtime/edition.ts';
test('native hosts recognize current and legacy desktop identities',()=>{
 for(const agent of ['HorizonDesktop/0.1','OpenClaudeDesktop/0.1'])assert.equal(requestEdition({headers:{'user-agent':agent}},true),'desktop');
 assert.equal(requestEdition({headers:{'user-agent':'Mozilla/5.0'}},true),'web');
 assert.equal(requestEdition({headers:{}},true),'web');
});
test('a desktop user agent cannot grant native capabilities on a web host',()=>{
 assert.equal(requestEdition({headers:{'user-agent':'HorizonDesktop/0.1'}},false),'web');
 assert.equal(requestEdition({headers:{'user-agent':'OpenClaudeDesktop/0.1'}},false),'web');
});
