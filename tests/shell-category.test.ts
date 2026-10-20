import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {Store} from '../server/storage/database.ts';
import {ToolRegistry} from '../server/tools/registry.ts';
import {registerToolGroups,categoryDefinitions} from '../server/tools/groups.ts';
import {relevantDefinitions} from '../server/tools/discovery.ts';

test('terminal operations are one discoverable shell category with desktop policy',async()=>{
 const store=new Store(':memory:');const app:any={store,ephemeral:new Map()};const registry=new ToolRegistry(app);
 registry.register({name:'terminal_run',description:'Run a real command',input:z.object({command:z.string()}).strict(),handler:args=>({command:args.command})});
 registry.register({name:'terminal_read',description:'Read real output',input:z.object({job_id:z.string()}).strict(),handler:args=>({job_id:args.job_id})});
 registerToolGroups(registry);
 const ctx:any={app,edition:'desktop',conversationId:'c',runId:'r',signal:new AbortController().signal,emit:()=>{},loadedSkills:new Map()};
 try{const definitions=categoryDefinitions(registry.definitions(undefined,true,ctx));assert.ok(definitions.some(item=>item.function.name==='shell'));assert.ok(relevantDefinitions(definitions,'Run a terminal command','chat',new Set(),true).some(item=>item.function.name==='shell'));const ran=await registry.execute({id:'1',name:'shell',arguments:{action:'run',command:'echo hi'}},ctx);assert.equal(ran.status,'succeeded',JSON.stringify(ran.error));assert.equal(ran.data.command,'echo hi');ctx.edition='web';const denied=await registry.execute({id:'2',name:'shell',arguments:{action:'run',command:'echo hi'}},ctx);assert.equal(denied.status,'failed');assert.equal(denied.error.code,'EDITION_TOOL_DISABLED');}finally{store.close();}
});
