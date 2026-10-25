import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/storage/database.ts';
import {createTools} from '../server/tools/index.ts';
import {EngineToolBridge} from '../server/engine/tool-bridge.ts';
import {setTaskScope} from '../server/tools/task-routing.ts';
test('private engine bridge filters its live tool list and enforces scope even for cached tool calls',async()=>{
 const store=new Store(':memory:');const app:any={store,ephemeral:new Map(),root:process.cwd(),dataDirectory:'.local',runtime:{ready:true}};const registry=createTools(app),bridge=new EngineToolBridge(registry);
 const ctx:any={app,conversationId:'bridge-scope',runId:'web-turn',signal:new AbortController().signal,edition:'desktop',vision:true,approvalMode:'full',emit:()=>{},loadedSkills:new Map()};setTaskScope(ctx,'Search the web for current weather');
 const link=await bridge.bind(ctx);const transport=link.server.transport;
 async function call(method:string,id:number,params?:any){const response=await fetch(transport.url,{method:'POST',headers:{'Content-Type':'application/json',...transport.headers},body:JSON.stringify({jsonrpc:'2.0',method,id,params})});return response.json();}
 try{const listed=await call('tools/list',1);assert.ok(listed.result.tools.some((tool:any)=>tool.name==='web_search'));assert.ok(!listed.result.tools.some((tool:any)=>tool.name==='terminal_run'));
  const blocked=await call('tools/call',2,{name:'terminal_run',arguments:{command:'echo forbidden'}});assert.equal(blocked.result.isError,true);assert.match(blocked.result.content[0].text,/TASK_TOOL_OUT_OF_SCOPE/);
  link.suspend();const code={...ctx,runId:'code-turn'};setTaskScope(code,'Fix source code in this repository');link.activate(code);
  const changed=await call('tools/list',3);assert.ok(changed.result.tools.some((tool:any)=>tool.name==='code_search'));assert.ok(!changed.result.tools.some((tool:any)=>tool.name==='web_search'));
  const unauthenticated=await fetch(transport.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',method:'tools/list',id:4})});assert.equal(unauthenticated.status,401);
 }finally{link.dispose();await bridge.close();store.close();}
});
