import {resolveProvider} from '../server/providers/credentials.ts';
import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createApp} from './helpers/authenticated-app.ts';
test('search and model credentials persist without appearing in entity responses',async()=>{
 const app:any=await createApp({dataDirectory:await mkdtemp(join(tmpdir(),'oc-cloud-')),dbPath:':memory:'});const headers={host:'127.0.0.1'};
 const send=(url:string,payload:any)=>app.inject({method:'POST',url,headers,payload});
 try{
  for(const [provider,apiKey]of [['brave','BRAVE_PRIVATE_SENTINEL'],['tavily','TAVILY_PRIVATE_SENTINEL']]){const r=await send('/api/search/credentials',{provider,apiKey});assert.equal(r.statusCode,200);assert.ok(!r.body.includes(apiKey));}
  assert.equal(app.context.store.get('settings','main').searchApiKeys.brave,'BRAVE_PRIVATE_SENTINEL');
  for(const url of ['/api/entities/settings','/api/entities/settings/main']){const r=await app.inject({url,headers});assert.ok(!r.body.includes('PRIVATE_SENTINEL'));assert.ok(r.body.includes('brave'));}
  const r=await send('/api/entities/providers',{id:'cloud',type:'openai',name:'Cloud',baseUrl:'https://example.com/v1',apiKey:'MODEL_PRIVATE_SENTINEL',modelIds:['vendor/model']});assert.equal(r.statusCode,200);assert.ok(!r.body.includes('MODEL_PRIVATE_SENTINEL'));
  await send('/api/entities/providers',{id:'cloud',name:'Renamed'});const stored=app.context.store.get('providers','cloud');assert.match(stored.apiKey,/^oc:v1:/);assert.equal(resolveProvider(app.context,stored).apiKey,'MODEL_PRIVATE_SENTINEL');
  await send('/api/entities/providers',{id:'cloud',baseUrl:'https://other.example/v1'});assert.equal(app.context.store.get('providers','cloud').apiKey,'');
  const bad=await send('/api/entities/providers',{id:'bad',type:'openai',name:'Bad',baseUrl:'http://example.com/v1',apiKey:'PRIVATE'});assert.equal(bad.statusCode,400);
  await send('/api/search/credentials',{provider:'brave',apiKey:''});assert.equal(app.context.store.get('settings','main').searchApiKeys.tavily,'TAVILY_PRIVATE_SENTINEL');
 }finally{await app.close();}
});
