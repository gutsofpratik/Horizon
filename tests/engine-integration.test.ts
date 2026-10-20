import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {EngineService} from '../server/engine/service.ts';
import {linkLocalInference} from '../server/engine/inference-link.ts';
import {Store} from '../server/storage/database.ts';

const built=existsSync('.local/components/agent-backend/openclaude-engine'+(process.platform==='win32'?'.exe':''));
test('pinned engine starts with authentication, loads its catalog, links inference without loading weights, and probes a custom ACP peer',{skip:!built,timeout:120000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'openclaude-engine-'));const store=new Store(':memory:');const app:any={store,ephemeral:new Map(),root:process.cwd(),dataDirectory:directory};const engine=new EngineService(app);
 try{
  assert.equal((await engine.start()).state,'ready');const response:any=await engine.request('/api/agents/management');assert.ok(response.data.length>=40);assert.ok(response.data.some((agent:any)=>agent.backend==='codex'));
  assert.equal((await fetch((engine as any).origin+'/health')).status,401);
  assert.equal((await fetch((engine as any).origin+'/health',{headers:{'x-openclaude-engine-token':(engine as any).token,Origin:'https://untrusted.example'}})).status,401);
  store.put('providers',{id:'builtin',name:'OpenClaude loader',type:'openai',baseUrl:'http://127.0.0.1:3001/api/builtin/v1'});store.put('local_models',{id:'fixture-model',configuration:{contextTokens:60000}});
  const linked=await linkLocalInference(app,engine,'builtin','fixture-model');assert.equal(linked.contextTokens,60000);assert.equal(linked.sharedLoader,true);assert.equal(linked.loadRequested,false);
  const providers:any=await engine.request('/api/providers');assert.equal(providers.data.find((p:any)=>p.id===linked.providerId).context_limit,60000);
  const peer=join(directory,'acp-peer.mjs');await writeFile(peer,`import readline from 'node:readline';
if(process.argv.includes('--version')){console.log('OpenClaude fixture 1.0.0');process.exit(0);}
readline.createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;const result=r.method==='initialize'?{protocolVersion:1,agentCapabilities:{loadSession:false,promptCapabilities:{image:false},mcpCapabilities:{http:false,sse:false}},agentInfo:{name:'OpenClaude fixture',version:'1.0.0'},authMethods:[]}:r.method==='session/new'?{sessionId:'fixture-session',modes:{currentModeId:'ask',availableModes:[{id:'ask',name:'Ask'}]},models:{currentModelId:'fixture-model',availableModels:[{modelId:'fixture-model',name:'Fixture'}]}}:{};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,result})+'\\n');});`);
  const probe:any=await engine.request('/api/agents/custom/try-connect','POST',{command:process.execPath,acp_args:[peer]});assert.equal(probe.data.step,'success',JSON.stringify(probe));
  const created:any=await engine.request('/api/agents/custom','POST',{name:'OpenClaude fixture',command:process.execPath,args:[peer]});assert.equal(created.data.agent_source,'custom');
 }finally{await engine.close();store.close();await rm(directory,{recursive:true,force:true});}
});
