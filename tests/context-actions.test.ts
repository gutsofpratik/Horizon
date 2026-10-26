import test from 'node:test';import assert from 'node:assert/strict';
import {contextActions,replaceSelection} from '../src/components/context-actions.ts';
test('application context actions exclude browser commands and protect password fields',()=>{
 assert.deepEqual(contextActions({editable:true,selected:true}),['copy','cut','paste','select-all']);
 assert.deepEqual(contextActions({editable:true,selected:true,password:true}),['paste','select-all']);
 assert.deepEqual(contextActions({editable:true,selected:true,readOnly:true}),['copy','select-all']);
 assert.deepEqual(contextActions({editable:false,selected:false,link:true}),['copy-link','select-all']);
});
test('clipboard editing replaces only the captured selection and clamps stale offsets',()=>{
 assert.deepEqual(replaceSelection('hello world',6,11,'Horizon'),{value:'hello Horizon',caret:13});
 assert.deepEqual(replaceSelection('abc',-5,99,'x'),{value:'x',caret:1});
});
