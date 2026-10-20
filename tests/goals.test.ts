import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/storage/database.ts';
import {MessageQueue} from '../server/agent/message-queue.ts';
import {GoalService} from '../server/goals/service.ts';
import {registerGoalTools} from '../server/goals/tools.ts';
import {ToolRegistry} from '../server/tools/registry.ts';
import Fastify from 'fastify';
import {registerGoalRoutes} from '../server/goals/routes.ts';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(incognito=false){
 const store=new Store(':memory:'),chat:any={id:'chat',messages:[],incognito},runs=new Map<string,any>(),started:any[]=[],cancelled:string[]=[];
 const agent:any={conversation:(id:string)=>id==='chat'?chat:undefined,getRun:(id:string)=>runs.get(id),events:(id:string)=>runs.get(id)?.events??[],cancel:(id:string)=>{cancelled.push(id);},start:async(input:any)=>{assert.equal(chat.activeRunId,undefined);started.push(input);const run={id:'run-'+started.length,conversationId:'chat',status:'running',events:[]};chat.activeRunId=run.id;runs.set(run.id,run);return run;}};
 const app:any={store,ephemeral:new Map([['agent',agent]])};const queue=new MessageQueue(app,agent);app.ephemeral.set('messageQueue',queue);const goals=new GoalService(app);app.ephemeral.set('goals',goals);
 const finish=(status='completed')=>{const run=runs.get(chat.activeRunId);run.status=status;chat.activeRunId=undefined;queue.settled(run,status);goals.settled(run,status);};
 return {store,chat,agent,app,queue,goals,runs,started,cancelled,finish,close(){goals.close();queue.close();store.close();}};
}
test('goals are explicit, bounded, persistent and do not duplicate dispatch',async()=>{const f=fixture();try{
 const goal=f.goals.create('chat',{objective:'Produce a verified report',runLimit:2});assert.equal(f.started.length,0);f.goals.start('chat',goal.id);f.goals.start('chat',goal.id);for(let i=0;i<10;i++)f.goals.tick();await flush();assert.equal(f.started.length,1);f.finish();await flush();assert.equal(f.started.length,2);f.finish();await flush();const saved=f.goals.read('chat',goal.id);assert.equal(saved.status,'paused');assert.match(saved.reason!,/Run limit/);assert.equal(saved.totalRuns,2);assert.equal(saved.steps.length,2);f.goals.start('chat',goal.id);await flush();assert.equal(f.started.length,3);assert.equal(f.goals.read('chat',goal.id).sessionRuns,1);
 }finally{f.close();}});
test('pause cancels queued goal work and prevents a later dispatch',async()=>{const f=fixture();try{
 f.chat.activeRunId='human';f.runs.set('human',{id:'human',status:'running'});const goal=f.goals.create('chat',{objective:'Help'});f.goals.start('chat',goal.id);assert.equal(f.queue.list('chat').length,0);f.chat.activeRunId=undefined;f.goals.tick();f.goals.pause('chat',goal.id);await flush();assert.equal(f.cancelled.length,1);f.finish('cancelled');await flush();f.goals.tick();assert.equal(f.started.length,1);assert.equal(f.goals.read('chat',goal.id).status,'paused');
 }finally{f.close();}});
test('goal errors, questions and completion stop continuation',async()=>{const f=fixture();try{
 const goal=f.goals.create('chat',{objective:'Help'});f.goals.start('chat',goal.id);await flush();const run=f.runs.get(f.chat.activeRunId);f.goals.event(run,'question.requested',{});assert.equal(f.goals.read('chat',goal.id).status,'paused');assert.equal(f.cancelled.length,0);f.finish();await flush();assert.equal(f.started.length,1);f.goals.start('chat',goal.id);await flush();f.finish('failed');await flush();assert.equal(f.goals.read('chat',goal.id).status,'paused');f.goals.start('chat',goal.id);await flush();f.goals.complete('chat',goal.id,'Verified report produced',false);f.finish();await flush();assert.equal(f.goals.read('chat',goal.id).status,'completed');assert.equal(f.started.length,3);
 }finally{f.close();}});
test('active run IDs are exposed before a response completes for UI attachment',async()=>{const f=fixture();try{const goal=f.goals.create('chat',{objective:'Help'});f.goals.start('chat',goal.id);await flush();f.goals.tick();assert.equal(f.goals.read('chat',goal.id).lastRunId,f.chat.activeRunId);assert.equal(f.goals.read('chat',goal.id).status,'running');}finally{f.close();}});
test('restart restores paused goals and cancels their old paused queue jobs',async()=>{const f=fixture();try{
 const goal=f.goals.create('chat',{objective:'Help'});f.goals.start('chat',goal.id);await flush();f.goals.close();const queue=new MessageQueue(f.app,f.agent);f.app.ephemeral.set('messageQueue',queue);const restarted=new GoalService(f.app);assert.equal(restarted.read('chat',goal.id).status,'paused');assert.equal(queue.list('chat')[0].status,'cancelled');restarted.tick();await flush();assert.equal(f.started.length,1);restarted.close();queue.close();
 }finally{f.close();}});
test('incognito and cross-conversation access are rejected and limits validated',()=>{const f=fixture(true);try{assert.throws(()=>f.goals.create('chat',{objective:'Secret'}),/saved conversation/);assert.equal(f.store.list('goals').length,0);}finally{f.close();}const g=fixture();try{assert.throws(()=>g.goals.create('chat',{objective:'Help',runLimit:26}));const goal=g.goals.create('chat',{objective:'Help'});assert.throws(()=>g.goals.read('other',goal.id),/Conversation/);}finally{g.close();}});
test('model cannot create or broaden autonomous scope from a continuation',async()=>{const f=fixture();try{
 f.store.put('conversations',{...f.chat,messages:[{role:'user',content:'[Goal continuation abc] Continue this user-authorized goal'}]});const registry=new ToolRegistry(f.app);registerGoalTools(registry);const goal=registry.tools.get('goal')!,ctx:any={app:f.app,conversationId:'chat'};
 await assert.rejects(async()=>goal.handler({action:'create',objective:'Do other tasks'},ctx),/explicitly/);const saved=f.goals.create('chat',{objective:'Original'});await assert.rejects(async()=>goal.handler({action:'update',goal_id:saved.id,objective:'Broaden scope'},ctx),/explicitly/);assert.equal(f.goals.read('chat',saved.id).objective,'Original');
 }finally{f.close();}});
test('HTTP goal controls validate scope and expose persisted progress',async()=>{const f=fixture(),http=Fastify();http.setErrorHandler((error:any,_request,reply)=>reply.code(400).send({error:error.message}));registerGoalRoutes(http,f.app);try{
 const base='/api/conversations/chat/goals';let response=await http.inject({method:'POST',url:base,payload:{objective:'Finish report',runLimit:26}});assert.equal(response.statusCode,400);
 response=await http.inject({method:'POST',url:base,payload:{objective:'Finish report'}});assert.equal(response.statusCode,200);const goal=response.json();assert.equal(goal.status,'draft');assert.equal(goal.runLimit,5);
 await http.inject({method:'PATCH',url:base+'/'+goal.id,payload:{progress:'Reviewed the available documents'}});const read=(await http.inject(base+'/'+goal.id)).json();assert.equal(read.steps[0].text,'Reviewed the available documents');assert.equal((await http.inject('/api/conversations/other/goals/'+goal.id)).statusCode,400);
 await http.inject({method:'POST',url:base+'/'+goal.id+'/complete',payload:{summary:'User verified the finished report'}});assert.equal((await http.inject(base+'/'+goal.id)).json().status,'completed');assert.equal(f.store.list('goals').length,1);
 }finally{await http.close();f.close();}});
