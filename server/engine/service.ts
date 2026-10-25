import {randomBytes} from 'node:crypto';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createServer} from 'node:net';
import type {AppContext} from '../app.ts';
import {ProcessSupervisor} from '../runtime/process-supervisor.ts';
import {engineRequestError} from './diagnostics.ts';

export class EngineService {
 private token=randomBytes(32).toString('hex');private origin='';private state='stopped';private error:string|undefined;private task?:Promise<any>;private child?:{stop:()=>Promise<void>};private closed=false;private stopping=false;
 private supervisor:ProcessSupervisor;
 constructor(private app:AppContext,private hostToolNames:string[]=[]){this.supervisor=new ProcessSupervisor(join(app.dataDirectory,'engine','runtime'));}
 private binary(){const name='openclaude-engine'+(process.platform==='win32'?'.exe':'');return process.env.OPENCLAUDE_ENGINE_BINARY??[join(this.app.root,'.local/components/agent-backend',name),join(this.app.root,'engine',name)].find(existsSync);}
 async snapshot(){let source:any;try{source=JSON.parse(await readFile(join(this.app.root,'vendor/upstream-lock.json'),'utf8'));}catch{}return {backend:'openclaude-engine',state:this.state,installed:!!this.binary(),error:this.error,source,defaultExecutor:false,migrationRequired:true,processes:this.supervisor.snapshot(),reason:'The current runtime remains active until engine migration and policy verification complete.'};}
 async start(){if(this.closed)throw new Error('Agent backend is closing');if(this.state==='ready')return this.snapshot();if(this.task)return this.task;this.task=this.launch().finally(()=>{this.task=undefined;});return this.task;}
 private async launch(){
  const executable=this.binary();if(!executable||!existsSync(executable))throw new Error('Build the pinned Horizon agent backend with npm run build:engine before starting it.');
  this.state='starting';this.error=undefined;this.stopping=false;
  try{await this.supervisor.recover();const port=await new Promise<number>((resolve,reject)=>{const server=createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const address=server.address();const number=typeof address==='object'&&address?address.port:0;server.close(()=>resolve(number));});});this.origin='http://127.0.0.1:'+port;
   this.child=await this.supervisor.start('agent-backend',executable,['--host','127.0.0.1','--port',String(port),'--data-dir',join(this.app.dataDirectory,'engine'),'--work-dir',join(this.app.dataDirectory,'engine-workspaces'),'--parent-pid',String(process.pid),'--local'],{cwd:this.app.root,env:{...process.env,OPENCLAUDE_ENGINE_TOKEN:this.token,OPENCLAUDE_HOST_TOOL_NAMES:JSON.stringify(this.hostToolNames),OPENCLAUDE_CHANNEL_RELAY_URL:"http://127.0.0.1:"+String(process.env.PORT??3001)+"/api/internal/channels",OPENCLAUDE_CHANNEL_RELAY_TOKEN:this.app.ephemeral.get("channels")?.token},onExit:code=>{this.state='stopped';if(!this.closed&&!this.stopping)this.error='Agent backend exited ('+code+'); interrupted operations were not replayed.';}});
   const deadline=Date.now()+60000;while(Date.now()<deadline){if(this.closed)throw new Error('Agent backend start cancelled');if(this.error)throw new Error(this.error);try{await this.request('/health','GET');this.state='ready';return this.snapshot();}catch{}await new Promise(resolve=>setTimeout(resolve,250));}throw new Error('Agent backend did not become ready within 60 seconds');
  }catch(error){this.error=(error as Error).message;await this.child?.stop();this.state='failed';throw error;}
 }
 async request(path:string,method='GET',body?:unknown){if(!this.origin)throw new Error('Agent backend is not started');if(!/^\/(?:health|api\/[a-zA-Z0-9/_.%:-]+)(?:\?[^#]*)?$/.test(path)||/%(?:2f|5c)/i.test(path.split('?')[0]))throw new Error('Unsupported agent backend route');const decoded=decodeURIComponent(path.split('?')[0]);if(decoded.split('/').some(segment=>segment==='.'||segment==='..')||decoded.includes('\\'))throw new Error('Unsupported agent backend route');const response=await fetch(this.origin+path,{method,headers:{'x-openclaude-engine-token':this.token,'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(/health-check|try-connect|runtime\/(?:ensure|restart)/.test(path)?90000:15000)});if(!response.ok)throw await engineRequestError(response);return response.json();}
 async stop(){this.stopping=true;await this.child?.stop();this.state='stopped';this.error=undefined;}
 async close(){this.closed=true;await this.stop();await this.supervisor.close();}
}
