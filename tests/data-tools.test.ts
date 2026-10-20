import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../server/storage/database.ts';
import {ToolRegistry} from '../server/tools/registry.ts';
import {registerDataTools} from '../server/tools/data.ts';
import {registerToolGroups} from '../server/tools/groups.ts';
import {workspaceRoot} from '../server/tools/files.ts';

test('scoped data actions parse, filter, sort, aggregate, and write CSV/JSON',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'openclaude-data-'));const store=new Store(':memory:');const app:any={store,dataDirectory:dir,ephemeral:new Map()};const registry=new ToolRegistry(app);registerDataTools(registry);registerToolGroups(registry);
 const ctx:any={app,edition:'desktop',conversationId:'data-chat',runId:'run',signal:new AbortController().signal,emit:()=>{},loadedSkills:new Map()};
 let serial=0;const call=(action:string,args:any={})=>registry.execute({id:String(++serial),name:'data',arguments:{action,...args}},ctx);
 try{const root=workspaceRoot(ctx);await mkdir(root,{recursive:true});await writeFile(join(root,'people.csv'),'name,score,team\n"Ada, A",12,blue\nBo,8,red\nCy,15,blue\n');
  let result=await call('read_csv',{path:'people.csv'});assert.equal(result.status,'succeeded',JSON.stringify(result.error));assert.equal(result.data.rows[0].name,'Ada, A');
  result=await call('filter',{path:'people.csv',field:'team',operator:'eq',value:'blue'});assert.equal(result.data.count,2);
  result=await call('sort',{path:'people.csv',field:'score',direction:'desc',numeric:true});assert.equal(result.data.rows[0].name,'Cy');
  result=await call('aggregate',{path:'people.csv',group_by:'team',field:'score',operation:'sum'});assert.deepEqual(result.data.rows.find((row:any)=>row.team==='blue').value,27);
  result=await call('write_json',{path:'summary.json',value:{count:3}});assert.equal(result.status,'succeeded');assert.deepEqual(JSON.parse(await readFile(join(root,'summary.json'),'utf8')),{count:3});
  result=await call('read_json',{path:'summary.json'});assert.deepEqual(result.data.value,{count:3});
  result=await call('write_csv',{path:'copy.csv',rows:[{name:'Ada, A',score:12}]});assert.equal(result.status,'succeeded');assert.match(await readFile(join(root,'copy.csv'),'utf8'),/"Ada, A"/);
  result=await call('read_csv',{path:'../outside.csv'});assert.equal(result.status,'failed');assert.equal(result.error.code,'PATH_OUTSIDE_WORKSPACE');
 }finally{store.close();await rm(dir,{recursive:true,force:true});}
});
