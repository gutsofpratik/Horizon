import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProfileRegistry} from '../server/runtime/profiles.ts';

test('name and password are sufficient, with a letter avatar and stable internal identity',()=>{
 const root=mkdtempSync(join(tmpdir(),'horizon-name-profile-'));
 try{const path=join(root,'profiles.json');const registry=new ProfileRegistry(path,join(root,'profiles'),join(root,'data'));const created=registry.create({name:'Demo',password:'demo-password-123'},'demo-session');assert.equal(created.profile.avatar,'letter');assert.match(created.profile.loginId,/^p-[a-f0-9]{20}$/);assert.equal(registry.login(created.profile.loginId,'demo-password-123').authenticated,true);const reopened=new ProfileRegistry(path,join(root,'profiles'),join(root,'data'));assert.equal(reopened.status().initialized,true);assert.equal(reopened.status().profiles[0].name,'Demo');assert.throws(()=>registry.create({name:'Unsafe image',password:'demo-password-123',avatarImage:'data:image/svg+xml;base64,PHN2Zz4='}),/PNG profile photo/);}finally{rmSync(root,{recursive:true,force:true});}
});

test('new profile opens its own onboarding after restart without exposing the previous data store',()=>{
 const root=mkdtempSync(join(tmpdir(),'horizon-profile-handoff-'));
 try{const path=join(root,'profiles.json'),profiles=join(root,'profiles'),legacy=join(root,'data');const registry=new ProfileRegistry(path,profiles,legacy);registry.create({name:'Owner',password:'owner-password-1'},'old-session');const guest=registry.create({name:'Guest',password:'guest-password-1'});const selected=registry.select(guest.profile.loginId,'guest-password-1','handoff-session');assert.equal(selected.restartRequired,true);assert.equal(registry.authenticateSession('handoff-session'),false,'old backend cannot unlock a new profile against the old database');assert.equal(registry.authenticateSession('old-session'),false);const reopened=new ProfileRegistry(path,profiles,legacy);assert.equal(reopened.authenticateSession('handoff-session'),true);assert.equal(reopened.status('handoff-session').profile?.name,'Guest');const again=new ProfileRegistry(path,profiles,legacy);assert.equal(again.authenticateSession('handoff-session'),false,'handoff is consumed once');}finally{rmSync(root,{recursive:true,force:true});}
});

test('creates a first profile with legacy data and authenticates it without exposing its password hash',()=>{
 const root=mkdtempSync(join(tmpdir(),'horizon-profile-'));
 try{
  const registry=new ProfileRegistry(join(root,'profiles.json'),join(root,'profiles'),join(root,'legacy-data'));
  const profile=registry.create({name:'Pratik Soni',loginId:'Pratik',password:'strong-password-1',avatar:'spark'},'session-a');
  assert.equal(profile.restartRequired,false);
  assert.equal(registry.activeProfile()?.legacyData,true);
  assert.deepEqual(registry.status('session-a').profile,{id:profile.profile.id,name:'Pratik Soni',loginId:'pratik',avatar:'spark',passwordRequired:true});
  assert.equal(JSON.stringify(registry.status('session-a')).includes('passwordHash'),false);
  assert.equal(registry.login('pratik','strong-password-1').authenticated,true);
  assert.equal(registry.login('pratik','wrong-password').authenticated,false);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('keeps later profiles isolated and requires a restart to activate another profile',()=>{
 const root=mkdtempSync(join(tmpdir(),'horizon-profile-'));
 try{
  const registry=new ProfileRegistry(join(root,'profiles.json'),join(root,'profiles'),join(root,'legacy-data'));
  const first=registry.create({name:'Owner',loginId:'owner',password:'owner-password-1',avatar:'spark'},'session-a');
  const second=registry.create({name:'Guest',loginId:'guest',password:'guest-password-1',avatar:'planet'},'session-b');
  assert.notEqual(first.profile.id,second.profile.id);
  assert.equal(second.restartRequired,false);
  assert.equal(registry.activeProfile()?.id,first.profile.id);
  assert.equal(registry.select('guest','bad-password').selected,false);
  assert.equal(registry.select('guest','guest-password-1').restartRequired,true);
  assert.equal(registry.activeProfile()?.id,second.profile.id);
  assert.equal(registry.dataDirectory(second.profile.id),join(root,'profiles',second.profile.id,'data'));
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('rejects weak passwords and rate limits repeated bad login attempts',()=>{
 const root=mkdtempSync(join(tmpdir(),'horizon-profile-'));
 try{
  const registry=new ProfileRegistry(join(root,'profiles.json'),join(root,'profiles'),join(root,'legacy-data'));
  assert.throws(()=>registry.create({name:'Owner',loginId:'owner',password:'short',avatar:'spark'}),/at least 8 characters/);
  registry.create({name:'Owner',loginId:'owner',password:'owner-password-1',avatar:'spark'});
  for(let attempt=0;attempt<5;attempt++)assert.equal(registry.login('owner','incorrect-password').authenticated,false);
  assert.equal(registry.login('owner','owner-password-1').authenticated,false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
