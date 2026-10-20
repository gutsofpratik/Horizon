import type {FastifyInstance} from 'fastify';
import type {AppContext} from '../app.ts';
import {z} from 'zod';
import {syncMessageIndex} from './message-index.ts';

function failure(message:string,statusCode=400){return Object.assign(new Error(message),{statusCode});}
function cursor(conversationId:string,messageId:string){return Buffer.from(JSON.stringify({v:1,c:conversationId,m:messageId})).toString('base64url');}
function readCursor(value:string,id:string){try{const parsed=JSON.parse(Buffer.from(value,'base64url').toString());if(parsed.v!==1||parsed.c!==id||typeof parsed.m!=='string')throw 0;return parsed.m as string;}catch{throw failure('Invalid message cursor for this conversation');}}
export function activeMessageBranch(conversation:any){const messages:any[]=conversation.messages??[];if(!conversation.headId)return messages;const byId=new Map(messages.map(message=>[message.id,message]));const chain:any[]=[],seen=new Set<string>();let id=conversation.headId;while(id&&!seen.has(id)){seen.add(id);const message=byId.get(id);if(!message)break;chain.push(message);id=message.parentId;}return chain.reverse();}

/** Build a searchable projection without changing the original conversation record. */
export function indexConversationMessages(app:AppContext,conversation:any){if(conversation.incognito)return;const db=app.store.db;db.exec('BEGIN IMMEDIATE');try{syncMessageIndex(db,conversation);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}}

export function conversationMessagePage(app:AppContext,conversation:any,query:{before?:string;after?:string;anchor?:string;limit?:number}={}){
 const limit=query.limit??50;if(!Number.isInteger(limit)||limit<1||limit>200)throw failure('Message page limit must be between 1 and 200');
 if([query.before,query.after,query.anchor].filter(Boolean).length>1)throw failure('Choose one message cursor or anchor');
 if(!conversation.incognito)return savedMessagePage(app,conversation,query);
 const branch=activeMessageBranch(conversation);let start=Math.max(0,branch.length-limit),end=branch.length;
 if(query.before||query.after){const target=readCursor((query.before??query.after)!,conversation.id),position=branch.findIndex(message=>message.id===target);if(position<0)throw failure('Message cursor no longer belongs to the active branch',409);if(query.before){end=position;start=Math.max(0,end-limit);}else{start=position+1;end=Math.min(branch.length,start+limit);}}
 if(query.anchor){const position=branch.findIndex(message=>message.id===query.anchor);if(position<0)throw failure('Message anchor not found in the active branch',404);start=Math.max(0,position-Math.floor(limit/2));end=Math.min(branch.length,start+limit);start=Math.max(0,end-limit);}
 const selected=branch.slice(start,end),branchIds=new Set(branch.map(message=>message.id));
 // Sibling identity rows preserve branch controls without transferring their bodies.
 const parents=new Set(selected.map(message=>message.parentId??null));
 const siblings=(conversation.messages??[]).filter((message:any)=>!branchIds.has(message.id)&&parents.has(message.parentId??null)).map((message:any)=>({id:message.id,parentId:message.parentId,role:message.role,runId:message.runId,messageIndexOnly:true}));
 const metadata={...conversation};delete metadata.messages;
 const anchors:Record<string,string>={};
 const artifacts=app.store.list('artifacts').filter(artifact=>artifact.conversationId===conversation.id);
 for(const artifact of artifacts){
  let target=branch.filter(message=>message.role==='assistant'&&artifact.creationRunId&&message.runId===artifact.creationRunId).at(-1);
  if(!target){const toolPosition=branch.findIndex(message=>{if(message.role!=='tool')return false;try{const result=JSON.parse(message.content);return result.data?.artifact?.id===artifact.id||(result.artifacts??[]).some((item:any)=>item.id===artifact.id);}catch{return false;}});if(toolPosition>=0)target=branch.slice(toolPosition+1).find(message=>message.role==='assistant')??branch.slice(0,toolPosition).filter(message=>message.role!=='tool').at(-1);}
  // Artifacts from another branch do not migrate onto the current page.
  if(!target&&!artifact.creationRunId)target=branch.find(message=>message.role==='assistant')??branch.find(message=>message.role!=='tool');
  if(target)anchors[artifact.id]=target.id;
 }
 metadata.messageArtifactAnchors=anchors;
 // Read selected bodies through the normalized projection for saved conversations.
 const messages=conversation.incognito?selected:selected.map(message=>{const row=app.store.db.prepare('SELECT payload FROM conversation_message_index WHERE conversation_id=? AND message_id=?').get(conversation.id,message.id);return row?JSON.parse(String(row.payload)):message;});
 return {conversation:metadata,messages,siblings,pagination:{limit,total:branch.length,storedTotal:(conversation.messages??[]).length,hasMoreBefore:start>0,hasMoreAfter:end<branch.length,before:selected.length?cursor(conversation.id,selected[0].id):null,after:selected.length?cursor(conversation.id,selected.at(-1).id):null,anchor:query.anchor??null},headId:conversation.headId??null};
}

function savedMessagePage(app:AppContext,conversation:any,query:{before?:string;after?:string;anchor?:string;limit?:number}){
 const db=app.store.db,id=conversation.id,limit=query.limit??50;
 // Import legacy bodies once; the original database record remains untouched.
 if(!db.prepare('SELECT 1 FROM conversation_message_revisions WHERE conversation_id=?').get(id)){const legacy=app.store.get('conversations',id);if(legacy)indexConversationMessages(app,legacy);else if(Array.isArray(conversation.messages))indexConversationMessages(app,conversation);}
 const columns="message_id,parent_id,ordinal,json_extract(payload,'$.role') AS role,json_extract(payload,'$.runId') AS run_id";
 const rows:any[]=conversation.headId?db.prepare(`WITH RECURSIVE branch(message_id,parent_id,ordinal,payload) AS (SELECT message_id,parent_id,ordinal,payload FROM conversation_message_index WHERE conversation_id=? AND message_id=? UNION SELECT m.message_id,m.parent_id,m.ordinal,m.payload FROM conversation_message_index m JOIN branch b ON m.message_id=b.parent_id WHERE m.conversation_id=?) SELECT ${columns} FROM branch ORDER BY ordinal`).all(id,conversation.headId,id):db.prepare(`SELECT ${columns} FROM conversation_message_index WHERE conversation_id=? ORDER BY ordinal`).all(id);
 let start=Math.max(0,rows.length-limit),end=rows.length;
 if(query.before||query.after||query.anchor){const target=query.anchor??readCursor((query.before??query.after)!,id),position=rows.findIndex(row=>row.message_id===target);if(position<0)throw failure('Message cursor or anchor is not on the active branch',409);if(query.before){end=position;start=Math.max(0,end-limit);}else if(query.after){start=position+1;end=Math.min(rows.length,start+limit);}else{start=Math.max(0,position-Math.floor(limit/2));end=Math.min(rows.length,start+limit);start=Math.max(0,end-limit);}}
 const selected=rows.slice(start,end),branchIds=new Set(rows.map(row=>row.message_id));
 const body=db.prepare('SELECT payload FROM conversation_message_index WHERE conversation_id=? AND message_id=?');const messages=selected.map(row=>JSON.parse(String(body.get(id,row.message_id)!.payload)));
 const siblings:any[]=[];const siblingIds=new Set<string>();const siblingQuery=db.prepare(`SELECT ${columns} FROM conversation_message_index WHERE conversation_id=? AND parent_id IS ? ORDER BY ordinal`);
 for(const parent of new Set(selected.map(row=>row.parent_id)))for(const sibling of siblingQuery.all(id,parent)){const siblingId=String(sibling.message_id);if(branchIds.has(siblingId)||siblingIds.has(siblingId))continue;siblingIds.add(siblingId);siblings.push({id:siblingId,parentId:sibling.parent_id,role:sibling.role,runId:sibling.run_id,messageIndexOnly:true});}
 const metadata={...conversation};delete metadata.messages;const anchors:Record<string,string>={};for(const artifact of app.store.list('artifacts').filter(item=>item.conversationId===id)){const target=artifact.creationRunId?rows.filter(row=>row.role==='assistant'&&row.run_id===artifact.creationRunId).at(-1):rows.find(row=>row.role==='assistant');if(target)anchors[artifact.id]=target.message_id;}metadata.messageArtifactAnchors=anchors;
 const stored=db.prepare('SELECT count(*) AS total FROM conversation_message_index WHERE conversation_id=?').get(id)!;
 return {conversation:metadata,messages,siblings,pagination:{limit,total:rows.length,storedTotal:Number(stored.total),hasMoreBefore:start>0,hasMoreAfter:end<rows.length,before:selected.length?cursor(id,selected[0].message_id):null,after:selected.length?cursor(id,selected.at(-1).message_id):null,anchor:query.anchor??null},headId:conversation.headId??null};
}

export function registerMessagePageRoutes(app:FastifyInstance,context:AppContext){
 app.get('/api/conversations/:id/messages',async(request:any)=>{const conversation=context.ephemeral.get(request.params.id)??context.store.metadata('conversations',request.params.id);if(!conversation)throw failure('Conversation not found',404);const query=z.object({before:z.string().max(2000).optional(),after:z.string().max(2000).optional(),anchor:z.string().max(1000).optional(),limit:z.coerce.number().int().min(1).max(200).default(50)}).strict().parse(request.query);return conversationMessagePage(context,conversation,query);});
}
