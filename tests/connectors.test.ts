import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {Store} from '../server/storage/database.ts';
import {ToolRegistry} from '../server/tools/registry.ts';
import {ConnectorManager} from '../server/connectors/manager.ts';
import {relevantDefinitions} from '../server/tools/discovery.ts';

async function fixture(oauth=true){
 let origin='',refreshes=0,verifier='',lastArguments:any,acceptToken='access-1';
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url!,origin);let body='';for await(const chunk of req)body+=chunk;
  const send=(status:number,value:any,headers:any={})=>{res.writeHead(status,{'Content-Type':'application/json',...headers});res.end(JSON.stringify(value));};
  if(url.pathname==='/.well-known/oauth-protected-resource/mcp')return send(200,{resource:origin+'/mcp',authorization_servers:[origin]});
  if(url.pathname==='/.well-known/oauth-authorization-server')return send(200,{issuer:origin,authorization_endpoint:origin+'/authorize',token_endpoint:origin+'/token',registration_endpoint:origin+'/register',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none']});
  if(url.pathname==='/register'){const metadata=JSON.parse(body);return send(201,{...metadata,client_id:'test-client'});}
  if(url.pathname==='/token'){
   const params=new URLSearchParams(body);
   if(params.get('grant_type')==='refresh_token'){refreshes++;acceptToken='access-2';return send(200,{access_token:acceptToken,refresh_token:'refresh-secret',token_type:'Bearer',expires_in:3600});}
   assert.equal(params.get('code'),'test-code');verifier=params.get('code_verifier')!;assert.ok(verifier.length>=43);
   return send(200,{access_token:'access-1',refresh_token:'refresh-secret',token_type:'Bearer',expires_in:3600});
  }
  if(url.pathname!=='/mcp')return send(404,{});
  if(oauth&&req.headers.authorization!=='Bearer '+acceptToken)return send(401,{error:'unauthorized'},{'WWW-Authenticate':`Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`});
  if(req.method==='GET'){res.writeHead(405);return res.end();}
  const message=JSON.parse(body);
  if(message.id===undefined){res.writeHead(202);return res.end();}
  let result:any;
  if(message.method==='initialize')result={protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'Test tools',version:'1'}};
  else if(message.method==='tools/list')result={tools:[{name:'lookup',description:'Look up a record',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false}}]};
  else if(message.method==='tools/call'){lastArguments=message.params.arguments;result={content:[{type:'text',text:'Found '+message.params.arguments.query}]};}
  else return send(200,{jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Unknown method'}});
  return send(200,{jsonrpc:'2.0',id:message.id,result});
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+(server.address() as any).port;
 const store=new Store(':memory:');const context:any={store,ephemeral:new Map()};const registry=new ToolRegistry(context);const manager=new ConnectorManager(context,registry);
 return {manager,registry,store,context,origin,get verifier(){return verifier;},get refreshes(){return refreshes;},get lastArguments(){return lastArguments;},expire(){acceptToken='expired';},async close(){await manager.close();store.close();await new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();});}};
}

test('OAuth authorization uses state and PKCE, exposes real tools, refreshes tokens, and disconnects',async()=>{
 const f=await fixture();try{
  const connector=await f.manager.save({name:'My service',url:f.origin+'/mcp'});
  const callback='http://127.0.0.1:3001/api/connectors/oauth/callback';
  const started=await f.manager.begin(connector!.id,callback);assert.equal(started.status,'authorization_required');
  const authorization=new URL(started.authorizationUrl!);assert.equal(authorization.searchParams.get('redirect_uri'),callback);assert.equal(authorization.searchParams.get('code_challenge_method'),'S256');
  await assert.rejects(()=>f.manager.complete('wrong-state','test-code'),/Invalid or expired/);
  const state=authorization.searchParams.get('state')!;
  const completed=await f.manager.complete(state,'test-code');assert.equal(completed.status,'connected');assert.equal(completed.toolCount,1);
  assert.equal(authorization.searchParams.get('code_challenge'),createHash('sha256').update(f.verifier).digest('base64url'));
  await assert.rejects(()=>f.manager.complete(state,'test-code'),/Invalid or expired/);
  const definitions=f.registry.definitions();assert.equal(definitions.length,1);assert.deepEqual(definitions[0].function.parameters.required,['query']);
  assert.equal(relevantDefinitions(definitions,'Find my record','chat').length,1);
  const ctx:any={app:f.context,conversationId:'test',runId:'run',signal:new AbortController().signal,emit:()=>{},loadedSkills:new Map()};
  const invalid=await f.registry.execute({id:'invalid',name:definitions[0].function.name,arguments:{query:123}},ctx);assert.equal(invalid.error.code,'INVALID_ARGUMENTS');assert.equal(f.lastArguments,undefined);
  f.expire();const result=await f.registry.execute({id:'valid',name:definitions[0].function.name,arguments:{query:'record'}},ctx);assert.equal(result.status,'succeeded');assert.equal(result.data.content[0].text,'Found record');assert.equal(f.refreshes,1);
  const publicData=JSON.stringify(f.manager.list());assert.ok(!publicData.includes('access-'));assert.ok(!publicData.includes('refresh-secret'));assert.ok(!publicData.includes(f.verifier));
  await f.manager.disconnect(connector!.id);assert.equal(f.registry.definitions().length,0);assert.equal(f.store.get('connector_credentials',connector!.id)?.tokens,undefined);
 }finally{await f.close();}
});

test('unauthenticated servers connect directly and editing the endpoint invalidates saved credentials',async()=>{
 const f=await fixture(false);try{
  const item=await f.manager.save({name:'Public tools',url:f.origin+'/mcp',authMode:'none'});
  assert.equal((await f.manager.begin(item!.id,'http://127.0.0.1:3001/api/connectors/oauth/callback')).status,'connected');
  f.store.put('connector_credentials',{id:item!.id,tokens:{access_token:'secret'}});
  await f.manager.save({id:item!.id,name:'Changed',url:f.origin+'/different',authMode:'none'});
  assert.equal(f.registry.definitions().length,0);assert.equal(f.store.get('connector_credentials',item!.id)?.tokens,undefined);
  await assert.rejects(()=>f.manager.save({name:'Bad',url:'https://user:secret@example.com/mcp'}),/without embedded credentials/);
 }finally{await f.close();}
});

test('saved authorization restores tools after restart without another sign-in',async()=>{
 const f=await fixture();let restarted:ConnectorManager|undefined;try{
  const item=await f.manager.save({name:'Saved connection',url:f.origin+'/mcp'});
  const initial=await f.manager.begin(item!.id,'http://127.0.0.1:3001/api/connectors/oauth/callback');
  const callback=new URL('http://127.0.0.1:3001/api/connectors/oauth/callback');callback.searchParams.set('state',new URL(initial.authorizationUrl!).searchParams.get('state')!);callback.searchParams.set('code','test-code');
  assert.equal(await f.manager.browserCallback(callback.href.replace('127.0.0.1:3001','127.0.0.1:9999')),null);
  assert.equal((await f.manager.browserCallback(callback.href))?.status,200);
  await f.manager.close();
  const registry=new ToolRegistry(f.context);restarted=new ConnectorManager(f.context,registry);await restarted.restore();
  assert.equal(restarted.view(item!.id).status,'connected');assert.equal(registry.definitions().length,1);
 }finally{await restarted?.close();await f.close();}
});

test('declined authorization leaves an actionable error and does not expose tools',async()=>{
 const f=await fixture();try{
  const item=await f.manager.save({name:'Declined',url:f.origin+'/mcp'});
  const initial=await f.manager.begin(item!.id,'http://127.0.0.1:3001/api/connectors/oauth/callback');
  await assert.rejects(()=>f.manager.complete(new URL(initial.authorizationUrl!).searchParams.get('state')!,undefined,'access_denied'),/declined/);
  assert.equal(f.manager.view(item!.id).status,'error');assert.equal(f.registry.definitions().length,0);
  assert.equal(f.store.get('connector_credentials',item!.id)?.verifier,undefined);
 }finally{await f.close();}
});
