import {z} from 'zod';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {stat} from 'node:fs/promises';
import {ToolError,type ToolRegistry,type ToolContext} from './registry.ts';
import {safePath,workspaceRoot,registerFile,projectKey} from './files.ts';
import {needsApproval,requestApproval} from './approvals.ts';

const run=promisify(execFile);
const value=z.union([z.string().max(20000),z.number().finite(),z.null()]);
const base={path:z.string().min(1).max(500)};
const query={...base,sql:z.string().min(1).max(30000),parameters:z.array(value).max(100).default([])};
// Run SQLite out of process so expensive recursive queries cannot block the server.
const worker=String.raw`
const {DatabaseSync}=require('node:sqlite');
const a=JSON.parse(process.argv[1]),db=new DatabaseSync(a.path,{readOnly:!a.write,allowExtension:false});
try {
 db.exec('PRAGMA busy_timeout=1500; PRAGMA trusted_schema=OFF;');
 if(!a.write)db.exec('PRAGMA query_only=ON');
 const s=db.prepare(a.sql);s.setReadBigInts(true);
 const clean=v=>typeof v==='bigint'?v.toString():v instanceof Uint8Array?{blob_bytes:v.length}:typeof v==='string'?v.slice(0,4000):v;
 if(a.write){db.exec('BEGIN IMMEDIATE');try{const result=s.run(...a.parameters);db.exec('COMMIT');console.log(JSON.stringify(result,(_,v)=>clean(v)));}catch(e){db.exec('ROLLBACK');throw e;}}
 else {const rows=[];let truncated=false,size=0;for(const r of s.iterate(...a.parameters)){const row=Object.fromEntries(Object.entries(r).map(([k,v])=>[k,clean(v)]));size+=JSON.stringify(row).length;if(rows.length>=a.limit||size>200000){truncated=true;break;}rows.push(row);}console.log(JSON.stringify({rows,truncated}));}
} finally {db.close();}`;

export function validateWorkspaceSql(sql:string,write=false){
 // Tokenize comments and literals before checking SQL; never treat a semicolon in a literal as a statement boundary.
 const tokens=sql.match(/--[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|`[^`]*`|\[[^\]]*\]|[A-Za-z_]+|;|[^\s]/g)??[];
 const code=tokens.filter(t=>!t.startsWith('--')&&!t.startsWith('/*'));
 if(code.at(-1)===';')code.pop();
 if(code.includes(';'))throw new ToolError('SQL_NOT_ALLOWED','Execute exactly one SQL statement');
 const words=code.filter(t=>/^[A-Za-z_]+$/.test(t)).map(t=>t.toUpperCase());
 if(words.some(w=>['ATTACH','DETACH','PRAGMA','VACUUM','LOAD_EXTENSION','VIRTUAL','TRIGGER'].includes(w)))throw new ToolError('SQL_NOT_ALLOWED','External databases, pragmas, extensions, virtual tables and triggers are unavailable');
 if(write?!['INSERT','UPDATE','DELETE','CREATE','ALTER','DROP','REPLACE'].includes(words[0]):!['SELECT','WITH','EXPLAIN'].includes(words[0]))throw new ToolError('SQL_NOT_ALLOWED',write?'Use a single data or schema mutation':'Use SELECT, WITH or EXPLAIN for read-only querying');
 if(write&&words[0]==='CREATE'&&!['TABLE','INDEX','UNIQUE','TEMP','TEMPORARY'].includes(words[1]))throw new ToolError('SQL_NOT_ALLOWED','Only table and index creation is supported');
}
async function execute(ctx:ToolContext,args:any,write=false){
 validateWorkspaceSql(args.sql,write);
 const path=await safePath(workspaceRoot(ctx),args.path);
 const info=await stat(path).catch(error=>{if(write&&error.code==='ENOENT')return null;throw error;});
 if(info&&(!info.isFile()||info.size>256*1024*1024))throw new ToolError('DATABASE_LIMIT','Use a regular SQLite file under 256 MB');
 if(write&&(ctx.executionDepth??0)===0&&needsApproval('database_execute',ctx.approvalMode??ctx.app.store.get('settings','main')?.approvalMode??'ask',args))await requestApproval('database_execute',args,ctx);
 // Recheck symlinks after approval, before opening the file.
 await safePath(workspaceRoot(ctx),args.path);
 try{const result=await run(process.execPath,['--no-warnings','-e',worker,JSON.stringify({...args,path,write,limit:args.limit??100})],{timeout:8000,maxBuffer:400000,signal:ctx.signal});const data=JSON.parse(result.stdout);if(write){try{return {...data,files:[await registerFile(ctx.app,path,projectKey(ctx),'application/vnd.sqlite3')]};}catch(error){return {...data,file_registration_error:(error as Error).message,summary:'The database mutation committed. File registration failed; inspect the database rather than repeating the mutation.'};}}return data;}
 catch(error){if(write&&((error as any).killed||(error as any).signal||ctx.signal.aborted||error instanceof SyntaxError))throw new ToolError('OUTCOME_UNKNOWN','Database execution was interrupted after dispatch. Inspect its current rows/schema before retrying; the mutation may have committed.');throw new ToolError('DATABASE_FAILED',String((error as any).stderr||(error as Error).message).slice(0,2000));}
}
export function registerDatabaseTools(registry:ToolRegistry){
 registry.register({name:'sql_query',capability:'workspace-file',description:'Run one read-only SQLite SELECT/WITH/EXPLAIN against a workspace database. Bounded rows, cells, output and eight-second execution; no attachments or extensions.',input:z.object({...query,limit:z.number().int().min(1).max(500).default(100)}).strict(),handler:(a,c)=>execute(c,a)});
 registry.register({name:'database_execute',capability:'workspace-file',description:'Execute one SQLite data/schema mutation in a transaction after explicit approval. Can create a database in an existing workspace directory. No attachments, triggers, virtual tables or extensions.',input:z.object(query).strict(),handler:(a,c)=>execute(c,a,true)});
 registry.register({name:'table_list',capability:'workspace-file',description:'List tables and views in a workspace SQLite database.',input:z.object(base).strict(),handler:(a,c)=>execute(c,{...a,sql:"SELECT name,type FROM sqlite_schema WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name",parameters:[],limit:500})});
 registry.register({name:'schema_inspect',capability:'workspace-file',description:'Inspect SQLite schema definitions, optionally for one table and its indexes.',input:z.object({...base,table:z.string().min(1).max(200).optional()}).strict(),handler:(a,c)=>execute(c,{...a,sql:'SELECT name,type,tbl_name,sql FROM sqlite_schema WHERE (? IS NULL OR tbl_name=?) ORDER BY type,name',parameters:[a.table??null,a.table??null],limit:500})});
 registry.register({name:'database_search',capability:'workspace-file',description:'Search literal text in named columns of one SQLite table. Specify columns after inspecting the schema; returns at most 100 matching rows.',input:z.object({...base,table:z.string().min(1).max(200),columns:z.array(z.string().min(1).max(200)).min(1).max(20),query:z.string().min(1).max(1000),limit:z.number().int().min(1).max(100).default(30)}).strict(),handler:(a,c)=>{const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';return execute(c,{...a,sql:`SELECT * FROM ${quote(a.table)} WHERE ${a.columns.map((s:string)=>`instr(lower(CAST(${quote(s)} AS TEXT)),lower(?)) > 0`).join(' OR ')}`,parameters:a.columns.map(()=>a.query)});}});
}
