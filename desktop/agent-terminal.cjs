const {randomUUID}=require('node:crypto');const {resolve,relative,isAbsolute}=require('node:path');const {realpath}=require('node:fs/promises');
class NativeAgentTerminals{
 constructor(terminals,windowId,workspace){this.terminals=terminals;this.windowId=windowId;this.workspace=workspace;this.jobs=new Map();}
 async request(name,args,owner){
  if(name==='terminal_run'){
   const workspaceId=this.workspace();if(!workspaceId)throw new Error('Choose a folder in the desktop Code terminal before using native execution');const root=this.terminals.workspace(workspaceId,this.windowId);const cwd=await realpath(resolve(root.path,args.cwd??'.'));const part=relative(root.path,cwd);if(part.startsWith('..')||isAbsolute(part))throw new Error('Initial terminal directory must be inside the granted folder');const granted=cwd===root.path?{id:workspaceId}:await this.terminals.grant(cwd,this.windowId);const session=this.terminals.open(granted.id,this.windowId);const marker='__CLAUDE_DONE_'+randomUUID().replaceAll('-','');const job={id:session.id,owner,marker,interactive:!!args.interactive};this.jobs.set(session.id,job);
   const code=job.interactive?args.command:`& { ${args.command} }; $global:__claudeJobCode=if($?){0}else{if($LASTEXITCODE){$LASTEXITCODE}else{1}}; Write-Output ("${marker}:"+$global:__claudeJobCode)`;this.terminals.write(session.id,this.windowId,code+'\r');await new Promise(resolve=>setTimeout(resolve,300));return this.read(job,0);
  }
  const job=this.jobs.get(args.job_id);if(!job||job.owner!==owner)throw new Error('Terminal job is not owned by this conversation');
  if(name==='terminal_cancel'){this.terminals.close(job.id,this.windowId);job.cancelled=true;return {job_id:job.id,status:'cancelled'};}
  if(name==='terminal_stdin'){this.terminals.write(job.id,this.windowId,args.text);return {job_id:job.id,input_sent:true};}
  if(name==='terminal_read'){if(args.wait_ms)await new Promise(resolve=>setTimeout(resolve,Math.min(args.wait_ms,10000)));return this.read(job,args.offset??0);}throw new Error('Unsupported native terminal operation');
 }
 read(job,offset){const result=this.terminals.read(job.id,this.windowId,offset);const complete=this.terminals.read(job.id,this.windowId,0).output.replace(/\u001b\[[0-9;?]*[A-Za-z]/g,'').match(new RegExp('(?:^|[\\r\\n])'+job.marker+':(\\d+)'));const status=job.cancelled?'cancelled':complete?'completed':result.status==='exited'?'completed':'running';return {job_id:job.id,output:result.output,next_offset:result.nextOffset,truncated:result.truncated,status,exit_code:complete?Number(complete[1]):result.exitCode,native:true,shell:'PowerShell'};}
}
module.exports={NativeAgentTerminals};
