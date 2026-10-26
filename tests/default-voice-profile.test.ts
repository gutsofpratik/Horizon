import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ProfileRegistry} from '../server/runtime/profiles.ts';
import {Store} from '../server/storage/database.ts';
import {ensureDefaultSpeech} from '../server/models/default-speech.ts';
test('passwordless profiles remain passwordless after reopening without exposing hashes',()=>{
 const root=mkdtempSync(join(tmpdir(),'horizon-optional-password-'));
 try{const registry=new ProfileRegistry(join(root,'profiles.json'),join(root,'profiles'),join(root,'data'));const created=registry.create({name:'Demo'});assert.equal(created.profile.passwordRequired,false);const reopened=new ProfileRegistry(join(root,'profiles.json'),join(root,'profiles'),join(root,'data'));assert.equal(reopened.login(created.profile.loginId,'').authenticated,true);assert.equal(reopened.login(created.profile.loginId,'wrong').authenticated,false);assert.equal(JSON.stringify(reopened.status()).includes('passwordHash'),false);}finally{rmSync(root,{recursive:true,force:true});}
});
test('default speech automatically selects local Whisper without requiring a provider',async()=>{
 const store=new Store(':memory:');store.put('settings',{id:'main'});const original=globalThis.fetch;let requested:any;
 const context:any={store,ephemeral:new Map()};context.ephemeral.set('startModelDownload',async(body:any)=>{requested=body;store.put('local_models',{id:'whisper',name:'Whisper Tiny',path:'fixture',task:'speech',source:{repo:'openai/whisper-tiny'}});store.put('model_downloads',{id:'job',status:'completed',model:{id:'whisper'}});return {id:'job',status:'completed'};});
 globalThis.fetch=async()=>new Response(JSON.stringify({sha:'a'.repeat(40),siblings:[{rfilename:'config.json'},{rfilename:'preprocessor_config.json'},{rfilename:'model.safetensors'}]}),{headers:{'content-type':'application/json'}});
 try{const model=await ensureDefaultSpeech(context);assert.equal(model.id,'whisper');assert.equal(requested.repo,'openai/whisper-tiny');assert.equal(requested.task,'speech');assert.equal(store.get('settings','main')?.voiceMode,'local');assert.equal(store.get('settings','main')?.voiceModelId,'whisper');}finally{globalThis.fetch=original;store.close();}
});
