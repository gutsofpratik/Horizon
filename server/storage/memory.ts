import type {Store} from './database.ts';
import {randomUUID} from 'node:crypto';

export function saveMemory(store:Store,text:string,projectId:string|undefined,sourceConversation:string,key?:string){
 const previous=store.db.prepare("SELECT payload FROM entities WHERE bucket='memories' AND json_extract(payload,'$.projectId') IS ? AND "+(key?"json_extract(payload,'$.key')=?":"json_extract(payload,'$.text')=?")+' LIMIT 1').get(projectId??null,key??text);
 const existing=previous?JSON.parse(String(previous.payload)):undefined;
 if(existing?.text===text)return {memory:existing,deduplicated:true};
 return {memory:store.put('memories',{...existing,id:existing?.id??randomUUID(),text,projectId,sourceConversation,...(key?{key}:{})}),deduplicated:false,updated:!!existing};
}

export function memoryPage(store:Store,projectId:string|undefined,query='',offset=0,limit=20,anyWord=false){
 const words=query.match(/[\p{L}\p{N}_-]+/gu)?.slice(0,20)??[];
 const match=words.map(word=>'"'+word.replaceAll('"','""')+'"').join(anyWord?' OR ':' AND ');
 const scope="(json_extract(e.payload,'$.projectId') IS NULL OR json_extract(e.payload,'$.projectId')=?)";
 const from=match?'entities e JOIN entity_search s ON s.bucket=e.bucket AND s.id=e.id':'entities e';
 const where="e.bucket='memories' AND "+scope+(match?' AND entity_search MATCH ?':'');
 const args:any[]=[projectId??null,...(match?[match]:[])];
 const total=Number(store.db.prepare('SELECT count(*) AS total FROM '+from+' WHERE '+where).get(...args)?.total??0);
 const rows=store.db.prepare('SELECT e.payload FROM '+from+' WHERE '+where+' ORDER BY '+(match?'rank, ':'')+'e.updated_at DESC,e.id LIMIT ? OFFSET ?').all(...args,limit,offset);
 return {memories:rows.map(row=>JSON.parse(String(row.payload))),total,next_offset:offset+rows.length<total?offset+rows.length:null};
}

export function recallMemories(store:Store,projectId:string|undefined,request:string){
 const stop=new Set(['what','when','where','which','that','this','with','have','from','about','please','could','would','should','your','does','want','make','create','remember','know','tell','mine','user']);
 const query=(request.toLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu)??[]).filter(word=>!stop.has(word)).slice(0,16).join(' ');
 // Keep the policy small: retrieve a few matching facts, not the entire archive.
 return query?memoryPage(store,projectId,query,0,5,true).memories:[];
}
