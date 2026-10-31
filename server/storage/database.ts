import {createMessageIndex,syncMessageIndex} from './message-index.ts';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,existsSync} from 'node:fs';
import {dirname} from 'node:path';
export type Entity = {id:string;[key:string]:any};
const searchable=new Set(['conversations','projects','artifacts','memories','sources']);
function openCheckedDatabase(filename:string){
  let db:DatabaseSync|undefined;
  try{
    db=new DatabaseSync(filename);
    const rows=db.prepare('PRAGMA quick_check').all();
    if(rows.length!==1||Object.values(rows[0])[0]!=='ok')throw Object.assign(new Error('integrity check failed'),{code:'DATABASE_INTEGRITY_FAILED'});
    return db;
  }catch(cause){
    db?.close();
    // Permission, disk-full and lock errors are not evidence of corruption.
    if((cause as any)?.code!=='DATABASE_INTEGRITY_FAILED'&&![11,26].includes((cause as any)?.errcode))throw cause;
    throw Object.assign(new Error('Horizon found damaged saved data. The database and its WAL were preserved. Fully quit Horizon and restore a verified backup or start a fresh profile; do not delete database sidecar files while the app is running.',{cause}),{code:'DATABASE_INTEGRITY_FAILED'});
  }
}
export class Store {
  db:DatabaseSync;
  constructor(filename:string) {
    if(filename!==':memory:')mkdirSync(dirname(filename),{recursive:true});
    // Inspect the database and any committed WAL frames before schema changes.
    // Never silently reset a damaged profile or discard its WAL.
    this.db=openCheckedDatabase(filename);
    this.db.exec('PRAGMA synchronous=FULL; PRAGMA busy_timeout=3000;');
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS entities(bucket TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(bucket,id));
      CREATE VIRTUAL TABLE IF NOT EXISTS entity_search USING fts5(bucket UNINDEXED,id UNINDEXED,body);
      CREATE TABLE IF NOT EXISTS events(run_id TEXT NOT NULL,sequence INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(run_id,sequence));`);
    if(filename!==':memory:'&&!existsSync(filename+'.before-message-index.sqlite')&&this.db.prepare("SELECT 1 FROM entities WHERE bucket='conversations' LIMIT 1").get())this.db.prepare('VACUUM INTO ?').run(filename+'.before-message-index.sqlite');
    createMessageIndex(this.db);
  }
  private transactionDepth=0;
  transaction<T>(operation:()=>T):T {
    const nested=this.transactionDepth>0;
    if(!nested)this.db.exec('BEGIN IMMEDIATE');
    this.transactionDepth++;
    try{const result=operation();if(result&&typeof (result as any).then==='function')throw Error('Database transactions must be synchronous');if(!nested)this.db.exec('COMMIT');return result;}
    catch(error){if(!nested)this.db.exec('ROLLBACK');throw error;}
    finally{this.transactionDepth--;}
  }
  put(bucket:string,value:Entity):Entity {
    return this.transaction(()=>{
      const entity={...value,updatedAt:new Date().toISOString()};
      this.db.prepare('INSERT INTO entities VALUES(?,?,?,?) ON CONFLICT(bucket,id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').run(bucket,entity.id,JSON.stringify(entity),entity.updatedAt);
      this.db.prepare('DELETE FROM entity_search WHERE bucket=? AND id=?').run(bucket,entity.id);
      if(searchable.has(bucket))this.db.prepare('INSERT INTO entity_search(bucket,id,body) VALUES(?,?,?)').run(bucket,entity.id,JSON.stringify(entity));
      if(bucket==='conversations')syncMessageIndex(this.db,entity);
      return entity;
    });
  }
  metadata(bucket:string,id:string):Entity|undefined {const row=this.db.prepare("SELECT json_remove(payload,'$.messages') AS payload FROM entities WHERE bucket=? AND id=?").get(bucket,id);return row?JSON.parse(String(row.payload)):undefined;}
  get(bucket:string,id:string):Entity|undefined {const row=this.db.prepare('SELECT payload FROM entities WHERE bucket=? AND id=?').get(bucket,id);return row?JSON.parse(String(row.payload)):undefined;}
  list(bucket:string,summary=false):Entity[] {const projection=summary&&bucket==='conversations'?"json_remove(payload,'$.messages') AS payload":'payload';return this.db.prepare('SELECT '+projection+' FROM entities WHERE bucket=? ORDER BY updated_at DESC').all(bucket).map(row=>JSON.parse(String(row.payload)));}
  delete(bucket:string,id:string) {if(bucket==='conversations'){this.db.prepare('DELETE FROM conversation_message_index WHERE conversation_id=?').run(id);this.db.prepare('DELETE FROM conversation_message_revisions WHERE conversation_id=?').run(id);}this.db.prepare('DELETE FROM entities WHERE bucket=? AND id=?').run(bucket,id);this.db.prepare('DELETE FROM entity_search WHERE bucket=? AND id=?').run(bucket,id);}
  search(bucket:string,query:string,summary=false):Entity[] {
    if(!searchable.has(bucket)||!query.trim())return [];
    const match=query.trim().split(/\s+/).slice(0,20).map(word=>'"'+word.replaceAll('"','""')+'"').join(' AND ');
    const projection=summary&&bucket==='conversations'?"json_remove(entities.payload,'$.messages') AS payload":'entities.payload';
    return this.db.prepare('SELECT '+projection+' FROM entity_search JOIN entities ON entities.bucket=entity_search.bucket AND entities.id=entity_search.id WHERE entity_search MATCH ? AND entity_search.bucket=? ORDER BY rank LIMIT 100').all(match,bucket).map(row=>JSON.parse(String(row.payload)));
  }
  addEvent(runId:string,sequence:number,event:unknown){this.db.prepare('INSERT INTO events VALUES(?,?,?)').run(runId,sequence,JSON.stringify(event));}
  addEvents(runId:string,events:any[]){if(!events.length)return;const insert=this.db.prepare('INSERT INTO events VALUES(?,?,?)');this.db.exec('BEGIN IMMEDIATE');try{for(const event of events)insert.run(runId,event.sequence,JSON.stringify(event));this.db.exec('COMMIT');}catch(error){this.db.exec('ROLLBACK');throw error;}}
  events(runId:string,after=0,types?:string[]):any[]{const filter=types?.length?" AND json_extract(payload,'$.type') IN ("+types.map(()=>'?').join(',')+')':'';return this.db.prepare('SELECT payload FROM events WHERE run_id=? AND sequence>?'+filter+' ORDER BY sequence').all(runId,after,...(types??[])).map(row=>JSON.parse(String(row.payload)));}
  close(){try{this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');}finally{this.db.close();}}
}
