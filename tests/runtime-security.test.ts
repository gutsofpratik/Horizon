import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {Store} from '../server/storage/database.ts';
import {ToolRegistry} from '../server/tools/registry.ts';
import {registerLifecycleTools} from '../server/runtime/hooks.ts';
import {GoalService} from '../server/goals/service.ts';
import {createApp} from '../server/app.ts';
import {RemoteEnvironments} from '../server/runtime/environments.ts';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

function fixture(){const store=new Store(':memory:');store.put('settings',{id:'main',approvalMode:'full'});const app:any={store,ephemeral:new Map(),root:process.cwd()};const ctx:any={app,runId:'run',conversationId:'chat',edition:'desktop',vision:true,signal:new AbortController().signal,emit:()=>{},loadedSkills:new Map(),approvalMode:'full'};const registry=new ToolRegistry(app);return {store,app,ctx,registry};}
test('remote worker responses are bounded while streaming, even without a content length',async()=>{
 const f=fixture(),original=globalThis.fetch;let cancelled=false;let chunks=0;globalThis.fetch=async()=>new Response(new ReadableStream({pull(controller){if(++chunks<12)controller.enqueue(new Uint8Array(4000000));else controller.close();},cancel(){cancelled=true;}}));
 try{await assert.rejects(new RemoteEnvironments(f.app).call({url:'https://worker.example',token:'not-a-real-token'},'health',{},'test',AbortSignal.timeout(5000)),(error:any)=>error.code==='REMOTE_RESPONSE_LIMIT');assert.equal(cancelled,true);assert.ok(chunks<12);}finally{globalThis.fetch=original;f.store.close();}
});
test('a failed command hook blocks its target and a cancelled continuing hook cannot execute it',async()=>{
 const f=fixture();let writes=0;const controller=new AbortController();registerLifecycleTools(f.registry,f.app);
 f.registry.register({name:'target',capability:'workspace-file',description:'Write',input:z.object({}).strict(),handler:()=>{writes++;return {};}});
 f.registry.register({name:'terminal_run',capability:'terminal',description:'Hook command',input:z.object({}).strict(),handler:()=>({job_id:'job',status:'completed',exit_code:2,output:''})});
 f.store.put('lifecycle_hooks',{id:'hook',conversationId:'chat',name:'deny command',tool:'terminal_run',arguments:{},tool_match:'target',event:'PreToolUse',enabled:true,timeout_ms:1000,failure_mode:'block'});
 try{const denied=await f.registry.execute({id:'denied',name:'target',arguments:{}},f.ctx);assert.equal(denied.error.code,'HOOK_FAILED');assert.equal(writes,0);
 f.registry.register({name:'slow_hook',capability:'conversation',description:'Cancel during hook',input:z.object({}).strict(),handler:()=>{controller.abort();throw Error('Cancelled hook');}});
 f.store.put('lifecycle_hooks',{...f.store.get('lifecycle_hooks','hook')!,tool:'slow_hook',failure_mode:'continue'});
 const cancelled=await f.registry.execute({id:'cancelled',name:'target',arguments:{}},{...f.ctx,signal:controller.signal});assert.equal(cancelled.status,'cancelled');assert.equal(writes,0);
 }finally{f.store.close();}
});
test('remote grants constrain actual leaves and goal continuations preserve their execution policy',async()=>{
 const f=fixture(),chat:any={id:'chat',messages:[],model:'model',providerId:'provider'};f.store.put('conversations',chat);f.store.put('remote_grants',{id:'grant',conversationId:'chat',tools:['goal','web'],expiresAt:new Date(Date.now()+60000).toISOString()});
 f.registry.register({name:'terminal_run',capability:'terminal',description:'Write',input:z.object({}).strict(),handler:()=>({executed:true})});
 const queued:any[]=[];f.app.ephemeral.set('agent',{conversation:()=>chat,events:()=>[]});f.app.ephemeral.set('messageQueue',{list:()=>[],enqueue:(input:any)=>{queued.push(input);return {queueId:'queued'};}});
 const goals=new GoalService(f.app);const scoped={...f.ctx,remoteGrantId:'grant',enabledToolNames:['goal','web'],approvalMode:'ask',executionEnvironmentId:'worker'};
 try{const denied=await f.registry.execute({id:'escape',name:'terminal_run',arguments:{}},scoped);assert.equal(denied.error.code,'REMOTE_TOOL_DISABLED');const goal=goals.create('chat',{objective:'Find sources'},'desktop',scoped);goals.start('chat',goal.id);assert.equal(queued[0].remoteGrantId,'grant');assert.equal(queued[0].executionEnvironmentId,'worker');assert.deepEqual(queued[0].enabledToolNames,['goal','web']);assert.equal(queued[0].approvalMode,'ask');f.store.put('remote_grants',{...f.store.get('remote_grants','grant')!,revoked:true});f.store.put('goals',{...goals.read('chat',goal.id),pendingQueueId:undefined});goals.tick();assert.equal(queued.length,1);assert.equal(goals.read('chat',goal.id).status,'paused');assert.match(goals.read('chat',goal.id).reason!,/expired|revoked/);}finally{goals.close();f.store.close();}
});
test('trusted HTTPS remote origins reach only paired routes, never local management APIs',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'openclaude-remote-test-')),previous=process.env.OPENCLAUDE_REMOTE_ORIGIN;process.env.OPENCLAUDE_REMOTE_ORIGIN='https://remote.example';const app=await createApp({dataDirectory:directory,dbPath:':memory:'});app.get('/remote',async()=> 'Remote view');
 try{const headers={host:'remote.example',origin:'https://remote.example'};const remote=await app.inject({method:'GET',url:'/api/remote/session',headers});assert.match(remote.json().error,/authentication/i);const safeGet=await app.inject({method:'GET',url:'/api/remote/session',headers:{host:'remote.example'}});assert.match(safeGet.json().error,/authentication/i);assert.equal((await app.inject({method:'GET',url:'/remote',headers:{host:'remote.example'}})).statusCode,200);assert.equal((await app.inject({method:'GET',url:'/api/entities/settings',headers})).statusCode,403);assert.equal((await app.inject({method:'POST',url:'/api/remote/pairings',headers,payload:{}})).statusCode,403);assert.equal((await app.inject({method:'GET',url:'/api/remote/session',headers:{...headers,origin:'https://evil.example'}})).statusCode,403);}finally{await app.close();if(previous===undefined)delete process.env.OPENCLAUDE_REMOTE_ORIGIN;else process.env.OPENCLAUDE_REMOTE_ORIGIN=previous;await rm(directory,{recursive:true,force:true});}
});
test('a child goal dispatch preserves inherited remote authority without pretending to own the root conversation',()=>{
 const f=fixture(),chat={id:'child',messages:[],model:'model',providerId:'provider'},queued:any[]=[];f.app.ephemeral.set('agent',{conversation:()=>chat,events:()=>[]});f.app.ephemeral.set('messageQueue',{list:()=>[],enqueue:(input:any)=>{queued.push(input);return {queueId:'pending'};}});f.store.put('remote_grants',{id:'grant',conversationId:'root',tools:['goal','web'],expiresAt:new Date(Date.now()+60000).toISOString()});const goals=new GoalService(f.app);
 try{const goal=goals.create('child',{objective:'Find references'},'desktop',{...f.ctx,conversationId:'child',remoteGrantId:'grant',enabledToolNames:['goal','web'],approvalMode:'ask'});goals.start('child',goal.id);assert.equal(queued.length,1);assert.equal(queued[0].conversationId,'child');assert.equal(queued[0].inheritedRemoteGrantId,'grant');assert.equal(queued[0].remoteGrantId,undefined);assert.deepEqual(queued[0].enabledToolNames,['goal','web']);}finally{goals.close();f.store.close();}
});
