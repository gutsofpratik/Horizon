import {randomUUID} from 'node:crypto';import type {ToolContext} from './registry.ts';import type {AppContext} from '../app.ts';
export type ApprovalMode='ask'|'auto'|'full';
const readOnly=/^(?:artifact_(?:read|list)|browser_(?:snapshot|screenshot|find|zoom|scroll)|computer_(?:screenshot|wait)|terminal_read|document_extract|pdf_inspect|spreadsheet_inspect|web_search|web_fetch|plan_read|goal_read|goal_list|memory_search|chat_history_|conversation_|skills_list|skill_load|skill_read_resource|runtime_capabilities|clock_now|calculate|discover_tools)/;
export function needsApproval(name:string,mode:ApprovalMode,args:any={}){
 if(name==='goal'&&['list','read'].includes(args.action))return false;
 if(mode==='full'||readOnly.test(name)||name==='browser_tabs'&&args.action!=='close'||name==='ask_user')return false;
 if(mode==='auto'&&/^(?:artifact_|plan_|goal_|document_create|pdf_edit|spreadsheet_(?:create|edit)|slides_create|chart_create|image_transform|memory_(?:save|update)|files_(?:read|list|search|write|patch)|browser_open(?:_file)?$)/.test(name))return false;
 return true;
}
function publicArgs(value:any,depth=0):any {if(depth>5)return '[nested]';if(typeof value==='string')return value.slice(0,2000);if(Array.isArray(value))return value.slice(0,20).map(item=>publicArgs(item,depth+1));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,/password|secret|token|api.?key|authorization/i.test(key)?'[redacted]':publicArgs(item,depth+1)]));return value;}
const fault=(code:string,message:string)=>Object.assign(new Error(message),{code});
export function pendingApprovals(app:AppContext,runId:string){return [...app.ephemeral.entries()].filter(([key])=>key.startsWith('approval:'+runId+':')).map(([,item])=>item.record);}
export function resolveApproval(app:AppContext,runId:string,id:string,approved:boolean){const item=app.ephemeral.get('approval:'+runId+':'+id);if(!item||item.record.status!=='pending')throw fault('APPROVAL_NOT_PENDING','This action is no longer awaiting approval');item.finish(approved);return {ok:true};}
export function requestApproval(name:string,args:any,ctx:ToolContext):Promise<void>{
 const record={id:randomUUID(),runId:ctx.runId,conversationId:ctx.conversationId,messageId:ctx.messageId,name,arguments:publicArgs(args),status:'pending',createdAt:new Date().toISOString()},key='approval:'+ctx.runId+':'+record.id;
 return new Promise((resolve,reject)=>{
  let done=false;
  const finish=(approved:boolean,cancelled=false)=>{if(done)return;done=true;ctx.signal.removeEventListener('abort',abort);record.status=cancelled?'cancelled':approved?'approved':'denied';ctx.app.ephemeral.delete(key);if(!ctx.incognito)ctx.app.store.put('approvals',record);ctx.emit('approval.resolved',{id:record.id,status:record.status});if(cancelled)reject(fault('CANCELLED','Action cancelled without approval'));else if(!approved)reject(fault('APPROVAL_DENIED','The user denied this action. Do not retry it or switch tools to perform the same action without new authorization.'));else resolve();};
  const abort=()=>finish(false,true);
  ctx.app.ephemeral.set(key,{record,finish});if(!ctx.incognito)ctx.app.store.put('approvals',record);
  ctx.signal.addEventListener('abort',abort,{once:true});ctx.emit('approval.requested',record);ctx.emit('model.status',{messageId:ctx.messageId,phase:'approval'});if(ctx.signal.aborted)abort();
 });
}
