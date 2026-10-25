import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {registerDatabaseTools,validateWorkspaceSql} from '../server/tools/database-tools.ts';
import {registerRetrievalExtendedTools,retrievalDirectoryFiles} from '../server/tools/retrieval-extended.ts';
import {resolveApproval} from '../server/tools/approvals.ts';
import {workspaceRoot} from '../server/tools/files.ts';

test('workspace SQLite queries, mutation approval, bounds and isolation',async()=>{
 const dataDirectory=await mkdtemp(join(tmpdir(),'horizon-db-')),records=new Map<string,any>(),tools=new Map<string,any>();
 const app:any={dataDirectory,ephemeral:new Map(),store:{get:(t:string,id:string)=>records.get(t+':'+id),list:()=>[],put:(t:string,v:any)=>{records.set(t+':'+v.id,v);return v;}}};
 let approvals=0;const ctx:any={app,conversationId:'db-test',runId:'test',signal:new AbortController().signal,emit:(event:string,data:any)=>{if(event==='approval.requested'){approvals++;resolveApproval(app,'test',data.id,true);}}};
 const registry:any={register:(tool:any)=>tools.set(tool.name,tool)};registerDatabaseTools(registry);registerRetrievalExtendedTools(registry);
 const call=(name:string,args:any)=>{const tool=tools.get(name);return tool.handler(tool.input.parse(args),ctx);};
 try{
  const root=workspaceRoot(ctx);await mkdir(root,{recursive:true});const db=new DatabaseSync(join(root,'test.sqlite'));db.exec("CREATE TABLE people(name TEXT); INSERT INTO people VALUES ('Alice'),('Bob')");db.close();
  const result=await call('sql_query',{path:'test.sqlite',sql:'SELECT * FROM people',limit:1});assert.equal(result.rows.length,1);assert.equal(result.truncated,true);
  assert.equal((await call('database_search',{path:'test.sqlite',table:'people',columns:['name'],query:'ali'})).rows[0].name,'Alice');
  await assert.rejects(call('sql_query',{path:'test.sqlite',sql:"WITH x AS (SELECT 1) DELETE FROM people"}));
  await assert.rejects(call('sql_query',{path:'../test.sqlite',sql:'SELECT 1'}));
  for(const sql of ["ATTACH '/tmp/other' AS other",'SELECT 1; DELETE FROM people','PRAGMA writable_schema=ON'])assert.throws(()=>validateWorkspaceSql(sql));
  await call('database_execute',{path:'test.sqlite',sql:'INSERT INTO people VALUES (?)',parameters:['Carol']});assert.equal(approvals,1);
  assert.equal((await call('sql_query',{path:'test.sqlite',sql:'SELECT count(*) AS n FROM people'})).rows[0].n,'3');
  await writeFile(join(root,'notes.md'),'alpha beta alpha');const indexed=await retrievalDirectoryFiles(ctx,'.');assert.equal(indexed.file_ids.length,1);
  const ranking=await call('rerank',{query:'alpha',candidates:[{id:'b',text:'beta'},{id:'a',text:'alpha'}]});assert.equal(ranking.method,'lexical-term-coverage');assert.equal(ranking.results[0].id,'a');
  await assert.rejects(async()=>call('retrieve_chunks',{vector_store_id:'00000000-0000-4000-8000-000000000000',chunk_ids:['00000000-0000-4000-8000-000000000001']}));
 }finally{await rm(dataDirectory,{recursive:true,force:true});}
});
