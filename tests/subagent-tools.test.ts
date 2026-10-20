import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/storage/database.ts';
import {ToolRegistry} from '../server/tools/registry.ts';
import {registerSubagentTools} from '../server/tools/subagents.ts';
import {registerFileTools} from '../server/tools/files.ts';
import {registerToolGroups} from '../server/tools/groups.ts';
import {tmpdir} from 'node:os';

test('child agents start isolated scoped runs and can be cancelled',async()=>{
 const store=new Store(':memory:');store.put('conversations',{id:'parent',messages:[{role:'user',content:'Delegate these independent checks to an agent'}]});store.put('settings',{id:'main',providerId:'provider',model:'model'});
 const started:any[]=[];const cancelled:string[]=[];const agent:any={start:async(input:any)=>{started.push(input);return {id:'child-run',conversationId:'child-chat'};},getRun:(id:string)=>({id,status:'running'}),cancel:(id:string)=>{cancelled.push(id);return {ok:true};},conversation:()=>({messages:[]})};
 const app:any={store,dataDirectory:tmpdir(),ephemeral:new Map([['agent',agent]])},registry=new ToolRegistry(app);registerFileTools(registry);registerSubagentTools(registry);registerToolGroups(registry);
 const ctx:any={app,conversationId:'parent',projectId:'shared-project',runId:'parent-run',signal:new AbortController().signal,emit:()=>{},loadedSkills:new Map(),edition:'desktop',enabledToolNames:['agent','file','web']};
 const call=(id:string,args:any)=>registry.execute({id,name:'agent',arguments:args},ctx);
 try{const result=await call('spawn',{action:'spawn',task:'Inspect the package script',tools:['file']});assert.equal(result.status,'succeeded',JSON.stringify(result.error));assert.equal(started[0].projectId,undefined);assert.equal(started[0].enabledToolNames.includes('agent'),false);assert.deepEqual(started[0].enabledToolNames,['file']);const stopped=await call('stop',{action:'stop',agent_id:result.data.agent_id});assert.equal(stopped.status,'succeeded');assert.deepEqual(cancelled,['child-run']);}finally{store.close();}
});
