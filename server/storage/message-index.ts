import type {DatabaseSync} from 'node:sqlite';

export function createMessageIndex(db:DatabaseSync){db.exec(`CREATE TABLE IF NOT EXISTS conversation_message_index(conversation_id TEXT NOT NULL,message_id TEXT NOT NULL,ordinal INTEGER NOT NULL,parent_id TEXT,payload TEXT NOT NULL,PRIMARY KEY(conversation_id,message_id)); CREATE INDEX IF NOT EXISTS conversation_message_order ON conversation_message_index(conversation_id,ordinal);CREATE INDEX IF NOT EXISTS conversation_message_parent ON conversation_message_index(conversation_id,parent_id);CREATE TABLE IF NOT EXISTS conversation_message_revisions(conversation_id TEXT PRIMARY KEY,revision TEXT NOT NULL);`);}

/** Called inside the entity transaction. Keep unchanged rows instead of deleting the projection. */
export function syncMessageIndex(db:DatabaseSync,conversation:any){
 if(conversation.incognito||!Array.isArray(conversation.messages))return;
 const existing=new Set(db.prepare('SELECT message_id FROM conversation_message_index WHERE conversation_id=?').all(conversation.id).map(row=>String(row.message_id)));
 const upsert=db.prepare('INSERT INTO conversation_message_index VALUES(?,?,?,?,?) ON CONFLICT(conversation_id,message_id) DO UPDATE SET ordinal=excluded.ordinal,parent_id=excluded.parent_id,payload=excluded.payload WHERE ordinal!=excluded.ordinal OR parent_id IS NOT excluded.parent_id OR payload!=excluded.payload');
 const seen=new Set<string>();conversation.messages.forEach((message:any,index:number)=>{if(typeof message.id!=='string'||seen.has(message.id))return;seen.add(message.id);existing.delete(message.id);upsert.run(conversation.id,message.id,index,message.parentId??null,JSON.stringify(message));});
 const remove=db.prepare('DELETE FROM conversation_message_index WHERE conversation_id=? AND message_id=?');for(const id of existing)remove.run(conversation.id,id);
 db.prepare('INSERT INTO conversation_message_revisions VALUES(?,?) ON CONFLICT(conversation_id) DO UPDATE SET revision=excluded.revision').run(conversation.id,'incremental-v1');
}
