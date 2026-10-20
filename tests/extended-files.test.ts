import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../server/storage/database.ts';
import {ToolRegistry} from '../server/tools/registry.ts';
import {registerFileTools} from '../server/tools/files.ts';
import {registerExtendedFileTools} from '../server/tools/files-extended.ts';
import {registerToolGroups} from '../server/tools/groups.ts';

test('file, directory and archive categories perform real scoped operations',async()=>{
 const dataDirectory=mkdtempSync(join(tmpdir(),'openclaude-file-catalog-'));const store=new Store(':memory:');
 const app:any={dataDirectory,store,ephemeral:new Map()};const registry=new ToolRegistry(app);registerFileTools(registry);registerExtendedFileTools(registry);registerToolGroups(registry);
 const ctx:any={app,conversationId:'chat',runId:'run',signal:new AbortController().signal,emit:()=>{},loadedSkills:new Map(),edition:'desktop'};
 const run=(id:string,name:string,args:any)=>registry.execute({id,name,arguments:args},ctx);
 try{
  assert.ok(registry.definitions(undefined,false,ctx).some(tool=>tool.function.name==='file'));
  assert.equal((await run('mkdir','directory',{action:'create',path:'work'})).status,'succeeded');
  assert.equal((await run('write','file',{action:'write',path:'work/a.txt',text:'hello'})).status,'succeeded');
  assert.equal((await run('append','file',{action:'append',path:'work/a.txt',text:' world'})).status,'succeeded');
  assert.equal((await run('copy','file',{action:'copy',from:'work/a.txt',to:'work/b.txt'})).status,'succeeded');
  assert.equal((await run('archive','archive',{action:'create',paths:['work/a.txt','work/b.txt'],output_path:'bundle.zip'})).status,'succeeded');
  assert.equal((await run('extract','archive',{action:'extract',path:'bundle.zip',destination:'unpacked'})).status,'succeeded');
  const read=await run('read','file',{action:'read',path:'unpacked/work/b.txt'});assert.equal(read.data.text,'hello world');
  const denied=await run('escape','file',{action:'copy',from:'work/a.txt',to:'../escape.txt'});assert.equal(denied.error.code,'PATH_OUTSIDE_WORKSPACE');
  assert.equal((await run('compare','file',{action:'compare',left:'work/a.txt',right:'work/b.txt'})).data.equal,true);
 }finally{store.close();rmSync(dataDirectory,{recursive:true,force:true});}
});
