import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {workerExecutable} from '../server/models/process.ts';
import {buildContext} from '../server/agent/context.ts';import {Store} from '../server/storage/database.ts';

test('Windows workers select the no-console interpreter without changing setup python',async()=>{
 const root=await mkdtemp(join(tmpdir(),'openclaude-worker-'));try{
  const consolePython=join(root,'python.exe'),windowless=join(root,'pythonw.exe');await writeFile(consolePython,'test');
  assert.equal(await workerExecutable(consolePython,'win32'),consolePython);
  await writeFile(windowless,'test');assert.equal(await workerExecutable(consolePython,'win32'),windowless);
  assert.equal(await workerExecutable(consolePython,'linux'),consolePython);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('the default personality applies to normal, gateway and low-context chats',()=>{
 const store=new Store(':memory:'),app:any={store,ephemeral:new Map()};try{
  for(const [tokens,options] of [[60000,{}],[60000,{gateway:true}],[8192,{}],[60000,{conversational:true}]] as [number,any][]){
   const system=buildContext(app,{id:'chat',messages:[]},'',tokens,0,'',options)[0].content;
   assert.match(system,/Gen Z/);assert.match(system,/swear/i);assert.match(system,/serious/i);
  }
 }finally{store.close();}
});
