import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from './helpers/authenticated-app.ts';
import {Store} from '../server/storage/database.ts';
test('health reports usable storage without requiring Docker',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'claude-local-'));
  const app=await createApp({dataDirectory:dir,dbPath:':memory:'});
  try {const response=await app.inject({method:'GET',url:'/api/health'});assert.equal(response.statusCode,200);assert.equal(response.json().storage,'ready');}
  finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
test('a foreign host cannot use a matching Origin to access the loopback API',async()=>{const dir=mkdtempSync(join(tmpdir(),'claude-origin-'));const app=await createApp({dataDirectory:dir,dbPath:':memory:'});try{const response=await app.inject({method:'POST',url:'/api/entities/memories',headers:{host:'unrelated.example',origin:'http://unrelated.example'},payload:{text:'Must not be saved'}});assert.equal(response.statusCode,403);assert.equal((await app.inject('/api/entities/memories')).json().length,0);}finally{await app.close();rmSync(dir,{recursive:true,force:true});}});
test('opaque origins receive a clear rejection while local UI proxy origins work',async()=>{const dir=mkdtempSync(join(tmpdir(),'claude-origin-'));const app=await createApp({dataDirectory:dir,dbPath:':memory:'});try{assert.equal((await app.inject({url:'/api/health',headers:{host:'localhost:5173',origin:'null'}})).statusCode,403);assert.equal((await app.inject({url:'/api/health',headers:{host:'localhost:5173',origin:'http://localhost:5173'}})).statusCode,200);}finally{await app.close();rmSync(dir,{recursive:true,force:true});}});
test('runtime status reports Docker and worker availability separately',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'claude-runtime-health-'));
  const app=await createApp({dataDirectory:dir,dbPath:':memory:'});
  try {const response=await app.inject({method:'GET',url:'/api/runtime/health'});assert.equal(response.statusCode,200);const status=response.json();assert.equal(typeof status.docker.ready,'boolean');assert.equal(typeof status.worker.ready,'boolean');if(!status.docker.ready)assert.equal(status.worker.ready,false);}
  finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
test('entities persist after reopen and search indexes only public workspace content',()=>{
  const dir=mkdtempSync(join(tmpdir(),'claude-store-'));const db=join(dir,'state.sqlite');
  const first=new Store(db);first.put('conversations',{id:'c1',title:'Solar research',messages:[{content:'battery efficiency'}]});first.put('providers',{id:'p1',apiKey:'secret-string'});first.close();
  const second=new Store(db);
  try{assert.equal(second.get('conversations','c1')?.title,'Solar research');assert.equal(second.search('conversations','battery').length,1);assert.equal(second.search('providers','secret-string').length,0);}
  finally{second.close();rmSync(dir,{recursive:true,force:true});}
});
