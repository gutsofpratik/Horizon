import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Store} from '../server/storage/database.ts';import {createTools} from '../server/tools/index.ts';
function fixture(){const dataDirectory=mkdtempSync(join(tmpdir(),'claude-tools-'));const store=new Store(':memory:');const app={store,dataDirectory,root:process.cwd(),ephemeral:new Map()};return {tools:createTools(app),ctx:{app,conversationId:'test',runId:'run1',signal:new AbortController().signal,emit:()=>{},loadedSkills:new Map()},close(){store.close();rmSync(dataDirectory,{recursive:true,force:true});}};}
test('file tools reject traversal and artifact updates enforce version identity',async()=>{
 const f=fixture();try{const escaped=await f.tools.execute({id:'1',name:'files_write',arguments:{path:'../escape',text:'x'}},f.ctx);assert.equal(escaped.status,'failed');
 const created=await f.tools.execute({id:'2',name:'artifact_create',arguments:{title:'Demo',type:'html',source:'<h1>one</h1>'}},f.ctx);assert.equal(created.status,'succeeded');const id=created.data.artifact.id;
 await f.tools.execute({id:'3',name:'artifact_update',arguments:{artifact_id:id,expected_version:1,source:'<h1>two</h1>'}},f.ctx);
 const conflict=await f.tools.execute({id:'4',name:'artifact_update',arguments:{artifact_id:id,expected_version:1,source:'stale'}},f.ctx);assert.equal(conflict.error?.code,'VERSION_CONFLICT');}finally{f.close();}
});
test('duplicate dispatch returns the original mutation result and strict schemas reject extra fields',async()=>{
 const f=fixture();try{const call={id:'same',name:'memory_save',arguments:{text:'Remember this'}};const one=await f.tools.execute(call,f.ctx);const two=await f.tools.execute(call,f.ctx);assert.equal(one.status,'succeeded');assert.deepEqual(one,two);assert.equal(f.ctx.app.store.list('memories').length,1);
 const invalid=await f.tools.execute({id:'other',name:'calculate',arguments:{expression:'17 * 23',hostPath:'C:/'}},f.ctx);assert.equal(invalid.status,'failed');}finally{f.close();}
});
test('calculate performs bounded arithmetic and rejects code',async()=>{
 const f=fixture();try{const good=await f.tools.execute({id:'1',name:'calculate',arguments:{expression:'17 * 23'}},f.ctx);assert.equal(good.data.result,391);const bad=await f.tools.execute({id:'2',name:'calculate',arguments:{expression:'process.exit()'}},f.ctx);assert.equal(bad.status,'failed');}finally{f.close();}
});
