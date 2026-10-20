import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from './helpers/authenticated-app.ts';
import {backendDescriptor,publicAgent} from '../server/engine/capabilities.ts';
import {resolveProvider} from '../server/providers/credentials.ts';

test('provider API validates protocols, encrypts keys, never returns them, and clears credentials on destination changes',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'openclaude-provider-'));
 const app=await createApp({dataDirectory:directory,dbPath:':memory:',root:process.cwd()});
 try{
  const provider={id:'cloud',name:'Native Anthropic',type:'anthropic',baseUrl:'https://api.anthropic.com/v1',apiKey:'fixture-secret-only',modelIds:['fixture-model']};
  const saved=await app.inject({method:'POST',url:'/api/entities/providers',payload:provider});assert.equal(saved.statusCode,200,saved.body);assert.equal(saved.json().hasApiKey,true);assert.equal(saved.body.includes('fixture-secret-only'),false);
  const context=(app as any).context;const stored=context.store.get('providers','cloud');assert.match(stored.apiKey,/^oc:v1:/);assert.equal(resolveProvider(context,stored).apiKey,'fixture-secret-only');
  const listed=await app.inject('/api/entities/providers');assert.equal(listed.body.includes('fixture-secret-only'),false);assert.equal(listed.body.includes('oc:v1:'),false);
  const changed=await app.inject({method:'POST',url:'/api/entities/providers',payload:{id:'cloud',baseUrl:'https://other.example/v1'}});assert.equal(changed.statusCode,200);assert.equal(changed.json().hasApiKey,false);
  const invalid=await app.inject({method:'POST',url:'/api/entities/providers',payload:{id:'unsafe',name:'Unsafe',type:'gemini',baseUrl:'http://remote.example',apiKey:'fixture'}});assert.equal(invalid.statusCode,400);
 }finally{await app.close();await rm(directory,{recursive:true,force:true});}
});

test('backend descriptors preserve raw backend declarations separately from host/model/policy constraints',()=>{
 const row={id:'fixture',agent_type:'acp',installed:true,status:'offline',available_modes:{currentModeId:'ask',availableModes:[{id:'ask'}]},handshake:{agent_capabilities:{loadSession:true},auth_methods:[{id:'login'}]},env:[{name:'TOKEN',value:'do-not-return'}]};
 const descriptor=backendDescriptor(row,{edition:'web',availableTools:['browser_open']},{tools:['browser_open'],planApproved:false},{id:'text-only',vision:false});
 assert.deepEqual(descriptor.handshake.sessionCapabilities,{loadSession:true});assert.equal(descriptor.model?.vision,false);assert.equal(descriptor.health.status,'installed');assert.equal(descriptor.permissions.planApproved,false);assert.equal(JSON.stringify(publicAgent(row)).includes('do-not-return'),false);
});

test('upstream manifest pins source revisions and records authentication modifications',async()=>{
 const manifest=JSON.parse(await readFile('vendor/upstream-lock.json','utf8'));assert.equal(manifest.sources.length,2);for(const source of manifest.sources){assert.match(source.revision,/^[a-f0-9]{40}$/);assert.match(source.archiveSha256,/^[a-f0-9]{64}$/);assert.equal(source.license,'Apache-2.0');}assert.ok(manifest.sources[0].modifications.some((item:string)=>item.includes('token')));
});
