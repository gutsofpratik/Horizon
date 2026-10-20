import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../server/storage/database.ts';
import {ToolRegistry} from '../server/tools/registry.ts';
import {registerGitTools} from '../server/tools/git.ts';
import {registerToolGroups} from '../server/tools/groups.ts';
import {resolveApproval} from '../server/tools/approvals.ts';

test('structured Git actions use this workspace and protect commits',async()=>{
 const dataDirectory=mkdtempSync(join(tmpdir(),'openclaude-git-')),store=new Store(':memory:');const app:any={dataDirectory,store,ephemeral:new Map()};store.put('conversations',{id:'chat',messages:[{role:'user',content:'Please commit these repository changes'}]});const registry=new ToolRegistry(app);registerGitTools(registry);registerToolGroups(registry);
 const ctx:any={app,conversationId:'chat',runId:'git-run',signal:new AbortController().signal,loadedSkills:new Map(),approvalMode:'full',edition:'desktop',emit:(type:string,record:any)=>{if(type==='approval.requested')resolveApproval(app,'git-run',record.id,record.name==='git_push');}};
 const call=(id:string,args:any)=>registry.execute({id,name:'git',arguments:args},ctx);
 try{
  assert.ok(registry.definitions(undefined,false,ctx).some(tool=>tool.function.name==='git'));
  assert.equal((await call('init',{action:'init'})).status,'succeeded');
  const status=await call('status',{action:'status'});assert.equal(status.status,'succeeded');assert.match(status.data.stdout,/branch|commit/i);
  const denied=await call('commit',{action:'commit',message:'No changes'});assert.equal(denied.error.code,'APPROVAL_DENIED');
  const unauthorized=await call('push',{action:'push',remote:'origin',branch:'main'});assert.equal(unauthorized.error.code,'USER_AUTHORIZATION_REQUIRED');
  const invalid=await call('bad',{action:'show',revision:'--exec=oops'});assert.equal(invalid.error.code,'INVALID_ARGUMENTS');
 }finally{store.close();rmSync(dataDirectory,{recursive:true,force:true});}
});
