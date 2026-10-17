import type {AppContext} from '../app.ts';
import {projectKey} from '../tools/files.ts';
import {ToolError} from '../tools/registry.ts';

export function registeredAttachments(app:AppContext,attachments:any[],conversation:{id:string;projectId?:string},strict=true):any[]{
 if(!Array.isArray(attachments)||attachments.length>8)throw new ToolError('INVALID_ATTACHMENTS','Attach up to eight registered files');
 if(!attachments.length)return [];
 const scope=projectKey({conversationId:conversation.id,projectId:conversation.projectId});
 return attachments.map(attachment=>{
  const file=attachment&&typeof attachment.id==='string'?app.store.get('files',attachment.id):undefined;
  if(file&&file.scope===scope)return file;
  if(strict)throw new ToolError('ATTACHMENT_NOT_FOUND','The attached file is unavailable in this workspace. Upload it here before sending.');
  return {name:'Unavailable attachment',text:'[This earlier attachment is no longer available in this workspace.]'};
 });
}
