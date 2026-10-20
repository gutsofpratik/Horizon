import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {z} from 'zod';
import {Store} from '../server/storage/database.ts';
import {ToolRegistry} from '../server/tools/registry.ts';
import {registerHttpRoutes,registerHttpTools} from '../server/tools/http.ts';
import {registerMcpTools} from '../server/tools/mcp.ts';
import {registerToolGroups} from '../server/tools/groups.ts';
import {resolveApproval} from '../server/tools/approvals.ts';

test('saved HTTP APIs hide secrets, block escaping endpoints and require write approval',async()=>{
 const store=new Store(':memory:'),app:any={store,ephemeral:new Map()},server=Fastify();registerHttpRoutes(server,app);const registry=new ToolRegistry(app);registerHttpTools(registry);registerToolGroups(registry);let serial=0;
 const ctx:any={app,edition:'desktop',conversationId:'c',runId:'http-run',signal:new AbortController().signal,loadedSkills:new Map(),approvalMode:'full',emit:(type:string,data:any)=>{if(type==='approval.requested')resolveApproval(app,'http-run',data.id,false);}};
 const call=(args:any)=>registry.execute({id:String(++serial),name:'http',arguments:args},ctx);
 try{const response=await server.inject({method:'POST',url:'/api/http-connections',payload:{name:'Example',baseUrl:'https://api.example.com/v1/',token:'private-token'}});assert.equal(response.statusCode,200);assert.ok(!response.body.includes('private-token'));const saved=response.json();assert.equal(store.get('http_credentials',saved.id)?.token,'private-token');
  const list=await call({action:'list_connections'});assert.ok(!JSON.stringify(list).includes('private-token'));
  for(const path of ['https://other.example.com/','../outside']){const result=await call({action:'request',connection_id:saved.id,method:'GET',path});assert.equal(result.error.code,'URL_NOT_ALLOWED');}
  const denied=await call({action:'request',connection_id:saved.id,method:'POST',path:'items',body:{x:1}});assert.equal(denied.error.code,'APPROVAL_DENIED');
  const privateUrl=await server.inject({method:'POST',url:'/api/http-connections',payload:{name:'Private',baseUrl:'http://127.0.0.1/'}});assert.equal(privateUrl.statusCode,500); // standalone Fastify uses its default error handler
  await server.inject({method:'POST',url:'/api/http-connections',payload:{id:saved.id,name:'Example',baseUrl:'https://api.other.example/v1/'}});assert.equal(store.get('http_credentials',saved.id),undefined);
 }finally{await server.close();store.close();}
});

test('MCP wrapper cannot call another connector or skip its schema validation',async()=>{
 const store=new Store(':memory:');let calls=0;const app:any={store,ephemeral:new Map(),connectors:{ownsTool:(id:string,name:string)=>id==='one'&&name==='connector_one_action',list:()=>[{id:'one',name:'One',status:'connected',toolCount:1}]}};const registry=new ToolRegistry(app);registry.register({name:'connector_one_action',capability:'connector',description:'One action',input:z.object({value:z.string()}).strict(),handler:args=>{calls++;return {value:args.value};}});registerMcpTools(registry);registerToolGroups(registry);let serial=0;const ctx:any={app,conversationId:'c',runId:'mcp-run',signal:new AbortController().signal,emit:()=>{},loadedSkills:new Map()};
 const call=(args:any)=>registry.execute({id:String(++serial),name:'mcp',arguments:{action:'call_tool',...args}},ctx);
 try{assert.equal((await call({connection_id:'two',name:'connector_one_action',arguments:{value:'x'}})).error.code,'CONNECTOR_TOOL_UNAVAILABLE');assert.equal((await call({connection_id:'one',name:'connector_one_action',arguments:{}})).error.code,'INVALID_ARGUMENTS');const result=await call({connection_id:'one',name:'connector_one_action',arguments:{value:'real'}});assert.equal(result.status,'succeeded');assert.equal(result.data.value,'real');assert.equal(calls,1);}finally{store.close();}
});
