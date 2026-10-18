import {invoke} from '@tauri-apps/api/core';
import {currentWorkspace,followTerminal} from './workspace';
type Command={id:string;name:string;args:any;owner:string;cancelId?:string};
type Job={id:string;owner:string;marker:string;status:string;exitCode:number|null;timer:ReturnType<typeof setTimeout>;offset:number;last?:any};
const jobs=new Map<string,Job>();const commands=new Map<string,string>();const cancelledCommands=new Set<string>();
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),value=>value.toString(16).padStart(2,'0')).join('');
async function request(path:string,body?:any){const response=await fetch('/api/native/tauri/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw new Error(data.error??'Desktop bridge request failed');return data;}
function owned(id:string,owner:string){const job=jobs.get(id);if(!job||job.owner!==owner)throw new Error('Terminal job does not belong to this conversation');return job;}
async function read(job:Job,offset:number,wait=0){
 if(job.status!=='running'&&job.last){const bytes=new TextEncoder().encode(job.last.output);const base=job.last.nextOffset-bytes.length;return {job_id:job.id,output:new TextDecoder().decode(bytes.slice(Math.max(0,offset-base))),next_offset:job.last.nextOffset,status:job.status,exit_code:job.exitCode,truncated:offset<base};}
 if(wait)await pause(Math.min(wait,1000));const result:any=await invoke('terminal_read',{id:job.id,offset});
 const full:any=await invoke('terminal_read',{id:job.id,offset:0});const clean=full.output.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'');
 job.last=full;
 const match=clean.match(new RegExp('(?:^|[\\r\\n])'+job.marker+'(-?\\d+)(?:[\\r\\n]|$)'));
 if(job.status==='running'){if(match){job.status='completed';job.exitCode=Number(match[1]);clearTimeout(job.timer);}else if(result.status==='exited'){job.status='completed';job.exitCode=result.exitCode;clearTimeout(job.timer);}}
 return {job_id:job.id,output:result.output,next_offset:result.nextOffset,status:job.status,exit_code:job.exitCode,truncated:result.truncated};
}
async function close(job:Job,status='cancelled'){clearTimeout(job.timer);job.status=status;await invoke('terminal_close',{id:job.id});}
async function watchCompletion(job:Job){while(job.status==='running'){await pause(500);if(job.status!=='running')break;try{await read(job,0);}catch{break;}}}
async function execute(command:Command){const {name,args,owner}=command;
 if(name==='cancel'){cancelledCommands.add(command.cancelId??'');await invoke('native_cancel',{requestId:command.cancelId});const id=commands.get(command.cancelId??'');if(id){const job=jobs.get(id);if(job&&job.status==='running')await close(job);}return {};}
 if(cancelledCommands.has(command.id))throw new Error('Desktop command cancelled');
 if(name==='terminal_run'){
  const scope=args.__workspace_scope??owner;const workspace=await currentWorkspace(scope);
  const marker='OC_DONE_'+crypto.randomUUID().replaceAll('-','')+'_';
  const script="$ErrorActionPreference='Stop'; $global:LASTEXITCODE=0; try { & {\n"+args.command+"\n} | Out-Default; if ($LASTEXITCODE) { exit $LASTEXITCODE }; exit 0 } catch { Write-Error $_ -ErrorAction Continue; exit 1 }";
  const bytes=new Uint8Array(script.length*2);for(let i=0;i<script.length;i++){const c=script.charCodeAt(i);bytes[i*2]=c&255;bytes[i*2+1]=c>>8;}
  const encoded=btoa(Array.from(bytes,byte=>String.fromCharCode(byte)).join(''));
  const opened:any=await invoke('terminal_open',{workspaceId:workspace.id,cwd:args.cwd??'.',encodedCommand:args.interactive?undefined:encoded});
  const job:Job={id:opened.id,owner,marker,status:'running',exitCode:null,offset:0,timer:setTimeout(()=>void (async()=>{try{await read(job,0);}finally{if(job.status==='running')await close(job,'timed_out');}})().catch(()=>{}),args.timeout_ms??60000)};
  jobs.set(job.id,job);commands.set(command.id,job.id);followTerminal(scope,job.id);window.dispatchEvent(new CustomEvent('native-terminal-session',{detail:{id:job.id,scope}}));
  if(cancelledCommands.has(command.id)){await close(job);throw new Error('Desktop command cancelled');}
  if(args.interactive)await invoke('terminal_write',{id:job.id,text:args.command+'\r'});
  void watchCompletion(job);
  return read(job,0,300);
 }
 if(name.startsWith('computer_'))return invoke('computer_tool',{name,args,owner,requestId:command.id});
 if(name.startsWith('browser_'))return invoke('browser_tool',{name,args,owner,requestId:command.id});
 const job=owned(args.job_id,owner);
 if(name==='terminal_read')return read(job,args.offset??0,args.wait_ms??0);
 if(name==='terminal_cancel'){await close(job);return {job_id:job.id,status:job.status};}
 if(name==='terminal_stdin'){if(job.status!=='running')throw new Error('Terminal job has stopped');await invoke('terminal_write',{id:job.id,text:args.text});return {job_id:job.id,status:job.status};}
 throw new Error('Native tool is unavailable: '+name);
}
export function startDesktopAgent(){let disposed=false,connected=false,computer=false,ipcReady=false,ipcError='';let browserTools:string[]|undefined,computerTools:string[]|undefined;
 const initialize=async()=>{try{computer=await invoke<boolean>('computer_status');const workspace=await currentWorkspace();sessionStorage.setItem('native-workspace',JSON.stringify(workspace));ipcReady=true;try{const capabilities:any=await invoke('browser_tool',{name:'browser_capabilities',args:{},owner:'capabilities',requestId:crypto.randomUUID()});if(Array.isArray(capabilities.tools))browserTools=capabilities.tools;}catch{}try{const capabilities:any=await invoke('computer_tool',{name:'computer_capabilities',args:{},owner:'capabilities',requestId:crypto.randomUUID()});if(Array.isArray(capabilities.tools))computerTools=capabilities.tools;}catch{} }catch(error){ipcError=String((error as any)?.message??error);}try{const saved=JSON.parse(sessionStorage.getItem('native-workspace')??'null');if(saved&&!await invoke<boolean>('workspace_status',{id:saved.id})){sessionStorage.removeItem('native-workspace');sessionStorage.removeItem('native-terminal');}}catch{sessionStorage.removeItem('native-workspace');}await poll();};
 const poll=async()=>{while(!disposed){try{
  if(!connected){await request('connect',{token,terminal:!!sessionStorage.getItem('native-workspace'),browser:ipcReady,browserTools,computer,computerTools,ipcReady,ipcError});connected=true;}
  const batch:Command[]=await request('commands');for(const command of batch)void execute(command).then(data=>command.name!=='cancel'&&request('result',{id:command.id,data})).catch(error=>command.name!=='cancel'&&request('result',{id:command.id,error:String(error.message??error)})).catch(()=>{});
 }catch{connected=false;}await pause(350);}};
 const refresh=()=>{connected=false;};window.addEventListener('native-workspace-changed',refresh);window.addEventListener('native-computer-grant',(event:Event)=>{computer=!!(event as CustomEvent).detail;connected=false;});void initialize();
 window.addEventListener('pagehide',()=>{disposed=true;for(const job of jobs.values())if(job.status==='running')void close(job);},{once:true});
}



