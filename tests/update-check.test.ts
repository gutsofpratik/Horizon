import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../server/storage/database.ts';
import {Updates} from '../server/runtime/updates.ts';

test('GitHub discovery works without a signing identity and preserves update preferences',async()=>{
 const root=await mkdtemp(join(tmpdir(),'horizon-updates-')),store=new Store(':memory:'),original=globalThis.fetch;
 try{
  await writeFile(join(root,'package.json'),JSON.stringify({version:'0.3.2'}));
  const updates=new Updates({root,store} as any);
  globalThis.fetch=async()=>new Response(JSON.stringify({tag_name:'v0.3.3',draft:false,prerelease:false,published_at:'2026-10-25T00:00:00Z'}));
  const status=await updates.checkRelease();
  assert.equal(status.release.newer,true);assert.equal(status.configured,false);
  assert.equal(status.automaticInstall,false);assert.ok(status.checkedAt);
  updates.configure({automaticCheck:false});
  assert.equal(new Updates({root,store} as any).preferences().automaticCheck,false);
  globalThis.fetch=async()=>new Response(JSON.stringify({tag_name:'v0.3.2',draft:false,prerelease:false}));
  assert.equal((await updates.checkRelease()).release.newer,false);
 }finally{globalThis.fetch=original;store.close();await rm(root,{recursive:true,force:true});}
});
test('failed GitHub checks report an error and release the checking state',async()=>{
 const root=await mkdtemp(join(tmpdir(),'horizon-updates-')),store=new Store(':memory:'),original=globalThis.fetch;
 try{
  await writeFile(join(root,'package.json'),JSON.stringify({version:'0.3.2'}));
  const updates=new Updates({root,store} as any);
  globalThis.fetch=async()=>new Response('',{status:503});
  await assert.rejects(updates.checkRelease(),/503/);
  const status=await updates.status();assert.equal(status.checking,false);assert.match(status.error!,/503/);
 }finally{globalThis.fetch=original;store.close();await rm(root,{recursive:true,force:true});}
});

test('signed updates survive restart, reject tampering and install only with user preference',async()=>{
 const root=await mkdtemp(join(tmpdir(),'horizon-signed-update-')),store=new Store(':memory:'),original=globalThis.fetch;
 try{
  const {privateKey,publicKey}=generateKeyPairSync('ed25519'),installer=Buffer.from('fixture installer; never executed');
  await mkdir(join(root,'runtime'));await writeFile(join(root,'package.json'),JSON.stringify({version:'0.3.2'}));
  await writeFile(join(root,'runtime/update-trust.json'),JSON.stringify({publicKey:publicKey.export({format:'pem',type:'spki'}),endpoint:'https://github.com/gutsofpratik/Horizon/releases/latest/download/update.json'}));
  const payload=Buffer.from(JSON.stringify({schemaVersion:1,version:'0.3.3',contractVersion:1,publishedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),notes:'fixture',assets:[{platform:process.platform,arch:process.arch,url:'https://github.com/gutsofpratik/Horizon/releases/download/v0.3.3/setup.exe',sha256:createHash('sha256').update(installer).digest('hex'),bytes:installer.length,kind:'installer'}]}));
  const envelope={payload:payload.toString('base64'),signature:sign(null,payload,privateKey).toString('base64')};
  globalThis.fetch=async(url:any)=>String(url).endsWith('update.json')?Response.json(envelope):new Response(installer);
  const updates=new Updates({root,dataDirectory:root,store} as any);
  await updates.check();const staged=await updates.stage(0);
  assert.deepEqual(await updates.prepareInstall(),{pending:false});
  updates.configure({automaticInstall:true});
  assert.equal(updates.preferences().automaticDownload,true);
  assert.equal(updates.preferences().automaticCheck,true);
  const restored=new Updates({root,dataDirectory:root,store} as any);
  globalThis.fetch=async()=>{throw new Error('Exiting must not require network access');};
  if(process.platform==='win32'){
   const prepared=await restored.prepareInstall();assert.equal(prepared.pending,true);assert.equal(prepared.path,staged.path);
   await writeFile(staged.path,Buffer.alloc(installer.length,0));
   await assert.rejects(restored.prepareInstall(),/modified/);
  }
  const record=store.get('update_metadata','main')!;store.put('update_metadata',{...record,signature:Buffer.alloc(64).toString('base64')});
  if(process.platform==='win32')await assert.rejects(restored.prepareInstall(),/signature/);
  updates.configure({automaticDownload:false});assert.equal(updates.preferences().automaticInstall,false);
 }finally{globalThis.fetch=original;store.close();await rm(root,{recursive:true,force:true});}
});
