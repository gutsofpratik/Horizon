import {spawn} from 'node:child_process';import {randomUUID} from 'node:crypto';import {mkdir,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {root,scoped,processEnv,wait,fault} from './common.mjs';import * as pty from 'node-pty';
const jobs=new Map();
function owned(id,session){const job=jobs.get(id);if(!job||job.session!==session)throw fault('JOB_NOT_FOUND','Job does not belong to this conversation');return job;}
function cancel(job){if(job.status!=='running')return;job.status='cancelled';try{if(job.pty)job.process.kill('SIGTERM');else process.kill(-job.process.pid,'SIGTERM');}catch{}setTimeout(()=>{try{if(job.pty)job.process.kill('SIGKILL');else process.kill(-job.process.pid,'SIGKILL');}catch{}},1500).unref();}
function view(job,offset=0){return {id:job.id,status:job.status,output:job.output.slice(offset,offset+20000),next_offset:Math.min(job.output.length,offset+20000),exit_code:job.exitCode,truncated:job.output.length>offset+20000};}
export async function terminal(operation,args,session,display){
 if(operation==='terminal_run'){
  if(typeof args.command!=='string'||!args.command||args.command.length>20000)throw fault('INVALID_ARGUMENTS','Invalid command');const cwd=await scoped(args.cwd??'.');await mkdir(cwd,{recursive:true});const job={id:randomUUID(),session,status:'running',output:'',exitCode:null,pty:!!args.interactive};
  const output=data=>{job.output=(job.output+data).slice(-1000000);};const closed=code=>{if(job.status==='running')job.status='completed';job.exitCode=code;clearTimeout(job.timer);mkdir(join(root,'.logs'),{recursive:true}).then(()=>writeFile(join(root,'.logs',job.id+'.log'),job.output)).catch(()=>{});};
  if(job.pty){job.process=pty.spawn('bash',['-lc',args.command],{name:'xterm-256color',cols:100,rows:30,cwd,env:processEnv(display)});job.process.onData(output);job.process.onExit(event=>closed(event.exitCode));}
  else{job.process=spawn('bash',['-lc',args.command],{cwd,env:processEnv(display),detached:true});job.process.stdout.on('data',output);job.process.stderr.on('data',output);job.process.on('error',error=>{output(error.message);closed(-1);});job.process.on('close',closed);}
  job.timer=setTimeout(()=>{job.output+='\n[Job timed out]\n';cancel(job);},Math.min(args.timeout_ms??60000,300000));jobs.set(job.id,job);await wait(600);return {job:view(job),summary:job.status==='running'?'Job started; read its output to check completion':`Command exited ${job.exitCode}`};
 }
 const job=owned(args.job_id,session);if(operation==='terminal_cancel')cancel(job);if(operation==='terminal_stdin'){if(job.status!=='running')throw fault('JOB_FINISHED','Job already finished');if(job.pty)job.process.write(args.text);else job.process.stdin.write(args.text);}
 if(operation==='terminal_read'&&job.status==='running'&&job.output.length<=(args.offset??0))await wait(Math.min(args.wait_ms??1000,10000));return {job:view(job,args.offset??0)};
}
export function cancelJobs(session){for(const job of jobs.values())if(job.session===session)cancel(job);}
