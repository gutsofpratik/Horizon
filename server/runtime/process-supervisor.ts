import {spawn,execFile,type ChildProcess} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,readlink,mkdir,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {ProcessRecord} from '../../packages/contracts/src/index.ts';
const exec=promisify(execFile);
async function ownGroup(pid:number){if(process.platform==='win32')return undefined;try{const result=await exec('ps',['-p',String(pid),'-o','pgid='],{timeout:5000});return Number(result.stdout.trim())===pid?pid:undefined;}catch{return undefined;}}
export async function processParent(pid:number):Promise<number|null>{if(!Number.isSafeInteger(pid)||pid<=0)return null;try{if(process.platform==='linux'){const stat=await readFile('/proc/'+pid+'/stat','utf8');return Number(stat.slice(stat.lastIndexOf(')')+2).split(/\s+/)[1]);}const result=process.platform==='win32'?await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',`(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').ParentProcessId`],{windowsHide:true,timeout:5000}):await exec('ps',['-p',String(pid),'-o','ppid='],{timeout:5000});const value=Number(result.stdout.trim());return Number.isSafeInteger(value)&&value>0?value:null;}catch{return null;}}
export async function processIdentity(pid:number):Promise<string|null>{
 if(!Number.isInteger(pid)||pid<=0)return null;
 try{
  if(process.platform==='win32'){const result=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',`$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; if($p){[Console]::Write(($p.CreationDate.ToUniversalTime().Ticks.ToString())+'|'+$p.ExecutablePath)}`],{windowsHide:true,timeout:5000});return result.stdout.trim()||null;}
  if(process.platform==='linux'){const stat=await readFile('/proc/'+pid+'/stat','utf8');return (await readFile('/proc/sys/kernel/random/boot_id','utf8')).trim()+'|'+stat.slice(stat.lastIndexOf(')')+2).split(/\s+/)[19]+'|'+await readlink('/proc/'+pid+'/exe');}
  const result=await exec('ps',['-p',String(pid),'-o','lstart=','-o','comm='],{timeout:5000});return result.stdout.trim()||null;
 }catch{return null;}
}
/** Only processes with a matching OS creation identity may be reaped. */
export class ProcessSupervisor {
 private children=new Map<string,{child:ChildProcess;record:ProcessRecord}>();private records:ProcessRecord[]=[];private writeQueue=Promise.resolve();private registrations=new Set<Promise<any>>();private closing=false;private hostIdentity:string|null=null;
 constructor(private directory:string){}
 private persist(){const snapshot=JSON.stringify({version:2,host:{pid:process.pid,identity:this.hostIdentity},processes:this.records},null,2);this.writeQueue=this.writeQueue.catch(()=>{}).then(async()=>{await mkdir(this.directory,{recursive:true});const file=join(this.directory,'processes.json'),temp=file+'.'+randomUUID();await writeFile(temp,snapshot,{mode:0o600});await rename(temp,file);});return this.writeQueue;}
 async recover(){let old:ProcessRecord[]=[],host:any;try{const registry=JSON.parse(await readFile(join(this.directory,'processes.json'),'utf8'));old=registry.processes??[];host=registry.host;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw new Error('Process registry is unreadable; recovery stopped without terminating anything');}
  if(host?.identity&&host.pid!==process.pid&&await processIdentity(host.pid)===host.identity)throw new Error('Another live OpenClaude host owns this process registry');this.hostIdentity=await processIdentity(process.pid);
  const retained:ProcessRecord[]=[];for(const record of old){if(!record.identity||record.pid===process.pid||await processIdentity(record.pid)!==record.identity)continue;
   // Another live host may share this data directory. Never reap its workers.
   const parent=await processIdentity(record.parentPid);if(record.kind==='native-terminal'&&process.env.OPENCLAUDE_DESKTOP_OWNED==='1'&&record.parentPid===process.ppid&&parent===record.parentIdentity){retained.push(record);continue;}if(record.parentPid!==process.pid&&parent&&(!record.parentIdentity||parent===record.parentIdentity))throw new Error('Another OpenClaude host owns registered workers. Close that host before starting another.');
   await this.terminate(record);}
  this.records=retained;await this.persist();
 }
 private async terminate(record:ProcessRecord){if(!record.identity||await processIdentity(record.pid)!==record.identity)return;
  // Capture group members while its leader still has the recorded creation identity.
  // If the leader exits gracefully, only these verified survivors can be killed.
  const members:{pid:number;identity:string}[]=[];
  if(record.processGroup&&process.platform!=='win32'&&await ownGroup(record.pid)===record.processGroup){
   const table=await exec('ps',['-e','-o','pid=','-o','pgid='],{timeout:5000}).catch(()=>null);
   for(const row of table?.stdout.split('\n')??[]){const [pid,group]=row.trim().split(/\s+/).map(Number);if(pid>0&&pid!==process.pid&&group===record.processGroup){const identity=await processIdentity(pid);if(identity)members.push({pid,identity});}}
  }
  if(await processIdentity(record.pid)!==record.identity)return;
  try{process.kill(record.processGroup&&process.platform!=='win32'?-record.processGroup:record.pid,'SIGTERM');}catch{return;}await new Promise(resolve=>setTimeout(resolve,500));if(await processIdentity(record.pid)!==record.identity){for(const member of members){if(await processIdentity(member.pid)===member.identity)try{process.kill(member.pid,'SIGKILL');}catch{}}return;}
  if(process.platform==='win32')await exec('taskkill.exe',['/PID',String(record.pid),'/T','/F'],{windowsHide:true,timeout:5000}).catch(()=>{});else try{process.kill(record.processGroup?-record.processGroup:record.pid,'SIGKILL');}catch{}
 }
 adopt(child:ChildProcess,kind:string,executable:string,processGroup?:number){const task=this.adoptRecord(child,kind,executable,processGroup);this.registrations.add(task);void task.finally(()=>this.registrations.delete(task)).catch(()=>{});return task;}
 private async adoptRecord(child:ChildProcess,kind:string,executable:string,processGroup?:number){
  if(this.closing){child.kill('SIGTERM');return;}
  if(!child.pid||child.exitCode!==null)return;
  const id=randomUUID();let exited=false;const remove=()=>{exited=true;this.children.delete(id);this.records=this.records.filter(record=>record.id!==id);void this.persist().catch(()=>{});};child.once('exit',remove);child.once('error',remove);
  const identity=await processIdentity(child.pid);if(exited||child.exitCode!==null)return;
  if(!identity)throw new Error('Cannot establish OS identity for '+kind+'; orphan cleanup will not guess from a PID');
  const group=processGroup===child.pid?processGroup:await ownGroup(child.pid);const record:ProcessRecord={id,pid:child.pid,parentPid:process.pid,parentIdentity:await processIdentity(process.pid)??undefined,kind,executable,identity,startedAt:new Date().toISOString(),...(group?{processGroup:group}:{})};
  if(exited)return;this.children.set(id,{child,record});this.records.push(record);await this.persist();return id;
 }
 async registerNative(pid:number,parentPid:number){
  if(await processParent(pid)!==parentPid)throw new Error('Native process is not a direct child of the owned desktop host');
  const [identity,parentIdentity]=await Promise.all([processIdentity(pid),processIdentity(parentPid)]);if(!identity||!parentIdentity)throw new Error('Cannot establish native process identity');
  if(this.records.some(record=>record.pid===pid&&record.identity===identity&&record.parentIdentity===parentIdentity))return;
  this.records=this.records.filter(record=>record.pid!==pid);
  const processGroup=await ownGroup(pid);this.records.push({id:randomUUID(),pid,parentPid,parentIdentity,identity,kind:'native-terminal',executable:'desktop-owned-pty',startedAt:new Date().toISOString(),...(processGroup?{processGroup}:{})});await this.persist();
 }
 async start(kind:string,executable:string,args:string[],options:{cwd:string;env?:NodeJS.ProcessEnv;onOutput?:(text:string)=>void;onExit?:(code:number|null)=>void}){
  if(this.closing)throw new Error('Process supervisor is shutting down');
  const environment={...(options.env??process.env)};delete environment.OPENCLAUDE_HOST_TOKEN;const child=spawn(executable,args,{cwd:options.cwd,env:environment,stdio:['ignore','pipe','pipe'],windowsHide:true,detached:process.platform!=='win32'});
  child.stdout?.on('data',value=>options.onOutput?.(String(value)));child.stderr?.on('data',value=>options.onOutput?.(String(value)));
  await new Promise<void>((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
  let notified=false;const exited=(code:number|null)=>{if(!notified){notified=true;options.onExit?.(code);}};child.once('exit',exited);
  let id:string|undefined;try{id=await this.adopt(child,kind,executable,process.platform!=='win32'?child.pid:undefined);}catch(error){child.kill('SIGTERM');throw error;}
  if(child.exitCode!==null)exited(child.exitCode);
  return {id:id??randomUUID(),pid:child.pid!,stop:()=>this.stopChild(child)};
 }
 snapshot(){return this.records.map(record=>({...record}));}
 async stopChild(child:ChildProcess){const owned=[...this.children.values()].find(item=>item.child===child);if(owned)return this.terminate(owned.record);if(child.exitCode===null&&!child.killed)child.kill('SIGTERM');}
 async close(){this.closing=true;await Promise.allSettled([...this.registrations]);await Promise.all([...this.records].map(record=>this.terminate(record)));await this.writeQueue;}
}
