import test from 'node:test';
import assert from 'node:assert/strict';
import {ToolCircuitBreaker,callFingerprint,type CircuitCall,type CircuitResult} from '../server/agent/tool-circuit-breaker.ts';
import {Store} from '../server/storage/database.ts';
import {createTools} from '../server/tools/index.ts';
import {Agent} from '../server/agent/orchestrator.ts';
const failed={status:'failed',error:{code:'TOOL_ERROR',message:'Service unavailable'}};
const succeeded={status:'succeeded',summary:'Saved result'};
function round(breaker:ToolCircuitBreaker,call:CircuitCall,result:CircuitResult=failed,validationStreak=0){breaker.observe(call,result);return breaker.finishRound({validationStreak});}
test('canonical fingerprints ignore nested object property order but preserve array order and actual arguments',()=>{
 const a={name:'read',arguments:{path:'x',options:{z:1,a:[1,2]}}};const b={name:'read',arguments:{options:{a:[1,2],z:1},path:'x'}};
 assert.equal(callFingerprint(a),callFingerprint(b));assert.notEqual(callFingerprint(a),callFingerprint({...a,arguments:{path:'y'}}));assert.notEqual(callFingerprint({name:'x',arguments:[1,2]}),callFingerprint({name:'x',arguments:[2,1]}));
});
test('identical failures are blocked before a third execution and halt within a bounded budget',()=>{
 const breaker=new ToolCircuitBreaker(),call={name:'read',arguments:{path:'missing'}};
 assert.equal(breaker.beforeCall(call),undefined);assert.equal(round(breaker,call).action,'correct');assert.equal(breaker.beforeCall(call),undefined);round(breaker,call);
 assert.equal(breaker.beforeCall(call)?.code,'REPEATED_TOOL_FAILURE');round(breaker,call);const decision=round(breaker,call);assert.equal(decision.action,'halt');assert.equal(decision.reason,'repeated_failure');assert.match(decision.message!,/Service unavailable/);assert.match(decision.message!,/remain saved/);assert.equal(breaker.beforeCall({name:'other'})?.code,'TOOL_CIRCUIT_OPEN');
});
test('validation recovery allows a corrected fourth call and successful calls remain executable',()=>{
 const breaker=new ToolCircuitBreaker(),call={name:'clock',arguments:{wrong:true}},invalid={status:'failed',error:{code:'INVALID_ARGUMENTS',message:'time_zone is required'}};
 for(let i=1;i<=3;i++)assert.notEqual(round(breaker,call,invalid,i).action,'halt');assert.equal(breaker.beforeCall(call)?.code,'REPEATED_INVALID_ARGUMENTS');
 const corrected={name:'clock',arguments:{time_zone:'UTC'}};breaker.observe(corrected,succeeded);assert.equal(breaker.finishRound().action,'continue');assert.equal(breaker.beforeCall(corrected),undefined);
 assert.equal(breaker.beforeCall(call),undefined,'a successful corrective action permits retry after the environment changes');
 breaker.observe(call,succeeded);breaker.finishRound();assert.equal(breaker.beforeCall(call),undefined);
});
test('all-error rounds halt even when each attempted tool or argument differs',()=>{
 const breaker=new ToolCircuitBreaker();for(let i=0;i<3;i++)assert.notEqual(round(breaker,{name:'read',arguments:{path:'missing-'+i}}).action,'halt');const d=round(breaker,{name:'write',arguments:{path:'missing-last'}});assert.equal(d.reason,'all_error_rounds');assert.equal(d.action,'halt');
});
for(const length of [2,3])test(length+'-operation discovery cycles are detected using canonical arguments',()=>{
 const breaker=new ToolCircuitBreaker();let decision:any;
 const operations=[{name:'discover_tools',arguments:{category:'browser',include:true}},{name:'skill_load',arguments:{id:'browser'}},{name:'runtime_capabilities',arguments:{}}].slice(0,length);
 // Multiple discovery actions per round still count toward a repeated operation cycle.
 for(let repeat=0;repeat<3;repeat++){for(const call of operations)breaker.observe(call,succeeded);decision=breaker.finishRound();}
 assert.equal(decision.action,'halt');assert.equal(decision.reason,'discovery_cycle');assert.match(decision.message!,new RegExp(length+'-operation'));
});
test('a concrete successful action breaks discovery/failure cycles and records real progress',()=>{
 const breaker=new ToolCircuitBreaker();for(let repeat=0;repeat<2;repeat++){breaker.observe({name:'discover_tools',arguments:{category:'files'}},succeeded);breaker.observe({name:'skill_load',arguments:{id:'files'}},succeeded);breaker.finishRound();}
 breaker.observe({name:'file_read',arguments:{path:'real.txt'}},succeeded);assert.equal(breaker.finishRound().action,'continue');
 breaker.observe({name:'discover_tools',arguments:{category:'files'}},succeeded);breaker.observe({name:'skill_load',arguments:{id:'files'}},succeeded);assert.notEqual(breaker.finishRound().action,'halt');
 for(let i=0;i<4;i++)round(breaker,{name:'file_read',arguments:{path:'missing-'+i}});assert.match(breaker.finishRound().message!,/1 successful action/);
});
test('corrective feedback and malformed-protocol recovery are bounded',()=>{
 const breaker=new ToolCircuitBreaker();const first=breaker.protocolFailure('Incomplete JSON'),second=breaker.protocolFailure('Incomplete JSON'),third=breaker.protocolFailure('Incomplete JSON');assert.equal(first.action,'correct');assert.equal(second.action,'correct');assert.equal(third.action,'halt');assert.match(third.message!,/precise blocker/);
 const failures=new ToolCircuitBreaker();assert.equal(round(failures,{name:'one'}).action,'correct');assert.equal(round(failures,{name:'two'}).action,'correct');assert.equal(round(failures,{name:'three'}).action,'continue');assert.equal(round(failures,{name:'four'}).action,'halt');
});
test('orchestrator stops repeated runtime failures, preserves successful results, and produces an actionable final answer',async()=>{
 const store=new Store(':memory:'),app:any={store,ephemeral:new Map(),root:process.cwd(),dataDirectory:'.local'};
 store.put('providers',{id:'fixture',name:'Fixture',type:'openai',baseUrl:'http://fixture'});store.put('settings',{id:'main',toolsEnabled:true,enabledToolNames:['clock_now','calculate']});
 const tools=createTools(app);let executed=0,rounds=0;tools.tools.get('clock_now')!.handler=async()=>{executed++;throw new Error('Clock service unavailable in fixture');};
 const agent=new Agent(app,tools,async function*(_provider:any,request:any){rounds++;if(rounds===1)yield {type:'tool_call',id:'sum',name:'calculate',arguments:{expression:'2+3'}};else if(request.tools.length)yield {type:'tool_call',id:'clock-'+rounds,name:'clock_now',arguments:{time_zone:'UTC'}};else{assert.match(request.messages.at(-1).content,/Clock service unavailable/);assert.match(request.messages.at(-1).content,/1 successful action/);yield {type:'content',text:'The calculation succeeded: 5. The clock service is unavailable; retry after restoring that service.'};}yield {type:'done'};});
 try{const run=await agent.start({providerId:'fixture',model:'fixture',content:'Calculate 2+3 and check the current time'});await agent.wait(run.id);const final=store.get('conversations',run.conversationId)!.messages.at(-1);assert.equal(agent.getRun(run.id).status,'completed',agent.getRun(run.id).error);assert.equal(executed,2);assert.equal(rounds,6);assert.match(final.content,/calculation succeeded: 5/);assert.match(final.content,/remains unfinished/);}finally{store.close();}
});
