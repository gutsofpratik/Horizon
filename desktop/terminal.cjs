const pty=require('node-pty');const {randomUUID}=require('node:crypto');const {realpath,stat}=require('node:fs/promises');const {basename}=require('node:path');const {execFile}=require('node:child_process');
class NativeTerminals{
 constructor(){this.workspaces=new Map();this.sessions=new Map();}
 async grant(path,owner){const root=await realpath(path);if(!(await stat(root)).isDirectory())throw new Error('Choose a directory');const value={id:randomUUID(),name:basename(root),path:root,owner};this.workspaces.set(value.id,value);return {id:value.id,name:value.name,path:value.path};}
 workspace(id,owner){const value=this.workspaces.get(id);if(!value||value.owner!==owner)throw new Error('Workspace has not been granted to this window');return value;}
 session(id,owner){const value=this.sessions.get(id);if(!value||value.owner!==owner)throw new Error('Terminal is not owned by this window');return value;}
 open(workspaceId,owner){const workspace=this.workspace(workspaceId,owner);const shell=process.platform==='win32'?'powershell.exe':process.env.SHELL||'/bin/bash';const args=process.platform==='win32'?['-NoLogo','-NoProfile']:[];const child=pty.spawn(shell,args,{name:'xterm-256color',cols:80,rows:24,cwd:workspace.path,env:{...process.env,TERM:'xterm-256color'},useConpty:true});const session={id:randomUUID(),owner,workspaceId,child,output:'',base:0,status:'running',exitCode:null};this.sessions.set(session.id,session);child.onData(data=>{session.output+=data;if(session.output.length>1024*1024){const removed=session.output.length-1024*1024;session.base+=removed;session.output=session.output.slice(removed);}});child.onExit(event=>{if(session.status!=='closed')session.status='exited';session.exitCode=event.exitCode;});return {id:session.id,shell,workspaceId,status:session.status};}
 read(id,owner,offset=0){const value=this.session(id,owner);if(!Number.isSafeInteger(offset)||offset<0)throw new Error('Invalid terminal cursor');return {id,output:value.output.slice(Math.max(0,offset-value.base)),nextOffset:value.base+value.output.length,truncated:offset<value.base,status:value.status,exitCode:value.exitCode};}
 write(id,owner,text){const value=this.session(id,owner);if(value.status!=='running')throw new Error('Terminal has exited');if(typeof text!=='string'||text.length>20000)throw new Error('Input exceeds terminal limits');value.child.write(text);}
 resize(id,owner,cols,rows){const value=this.session(id,owner);if(!Number.isInteger(cols)||!Number.isInteger(rows)||cols<2||cols>500||rows<2||rows>200)throw new Error('Invalid terminal dimensions');if(value.status==='running')value.child.resize(cols,rows);}
 close(id,owner){const value=this.session(id,owner);if(value.status==='running'){value.child.kill();}value.status='closed';return {closed:true};}
 revoke(owner){for(const session of this.sessions.values())if(session.owner===owner)this.close(session.id,owner);for(const [id,workspace]of this.workspaces)if(workspace.owner===owner)this.workspaces.delete(id);}
 dispose(){for(const value of this.sessions.values())this.close(value.id,value.owner);this.workspaces.clear();}
}
module.exports={NativeTerminals};


