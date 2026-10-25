import {z} from 'zod';
import {readdir,stat,readFile} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ToolError,type ToolRegistry,type ToolContext} from './registry.ts';
import {safePath,workspaceRoot,registerFile,projectKey,fileInContext} from './files.ts';

export async function retrievalDirectoryFiles(ctx:ToolContext,path:string){
 const root=workspaceRoot(ctx),start=await safePath(root,path),files:string[]=[],skipped:string[]=[];let visited=0;
 async function visit(dir:string,depth:number){
  if(depth>12)throw new ToolError('INDEX_LIMIT','Directory nesting exceeds twelve levels');
  for(const entry of await readdir(dir,{withFileTypes:true})){
   if(ctx.signal.aborted)throw new ToolError('CANCELLED','Indexing cancelled');
   if(++visited>2000)throw new ToolError('INDEX_LIMIT','Directory indexing visits at most 2000 entries');
   if(entry.isSymbolicLink()||['node_modules','.git','.skills','.env'].includes(entry.name))continue;
   const local=join(dir,entry.name),name=relative(root,local);
   await safePath(root,name);
   if(entry.isDirectory())await visit(local,depth+1);
   else if(entry.isFile()&&/\.(txt|md|json|csv|ts|tsx|js|jsx|py|html|css|xml|yaml|yml|log)$/i.test(entry.name)){
    if((await stat(local)).size>2_000_000){skipped.push(name);continue;}
    if((await readFile(local,'utf8')).includes('\0')){skipped.push(name);continue;}
    if(files.length>=20)throw new ToolError('INDEX_LIMIT','Select a directory with at most twenty supported text files');
    files.push((await registerFile(ctx.app,local,projectKey(ctx),'text/plain')).id);
   }
  }
 }
 await visit(start,0);return {file_ids:files,skipped};
}
export function registerRetrievalExtendedTools(registry:ToolRegistry){
 registry.register({name:'retrieval_index_directory',capability:'workspace-file',description:'Index up to twenty workspace text/code files recursively using the configured embedding provider. Skips symlinks, binary/large files, .git and node_modules. Uses retrieval_index and its policy checks.',input:z.object({path:z.string().max(500).default('.'),vector_store_id:z.string().uuid().optional()}).strict(),handler:async(a,c)=>{const files=await retrievalDirectoryFiles(c,a.path);if(!files.file_ids.length)throw new ToolError('NO_INDEXABLE_FILES','No supported text files found');const result=await registry.execute({id:randomUUID(),name:'retrieval_index',arguments:{file_ids:files.file_ids,vector_store_id:a.vector_store_id}},c);if(result.status!=='succeeded')throw new ToolError(result.error?.code??'INDEX_FAILED',result.summary);return {...result.data,skipped:files.skipped};}});
 registry.register({name:'retrieve_chunks',capability:'workspace-file',description:'Read specific indexed chunks by ID from a workspace vector store, preserving source file IDs and character offsets. Does not contact an embedding provider.',input:z.object({vector_store_id:z.string().uuid(),chunk_ids:z.array(z.string().uuid()).min(1).max(30)}).strict(),handler:(a,c)=>{const store=c.app.store.get('vector_stores',a.vector_store_id);if(!store||store.scope!==projectKey(c))throw new ToolError('STORE_NOT_FOUND','Vector store is not in this workspace');return {chunks:a.chunk_ids.map((id:string)=>{const chunk=store.chunks.find((v:any)=>v.id===id);if(!chunk)throw new ToolError('CHUNK_NOT_FOUND','Chunk is not in this store');fileInContext(c,chunk.file_id);const {vector,...data}=chunk;return data;})};}});
 registry.register({name:'rerank',capability:'workspace-file',description:'Deterministically rerank supplied text candidates using lexical query-term coverage and term frequency. This is local lexical ranking, not semantic or model-based reranking.',input:z.object({query:z.string().min(1).max(2000),candidates:z.array(z.object({id:z.string().max(200),text:z.string().max(10000)}).strict()).min(1).max(100),max_results:z.number().int().min(1).max(30).default(10)}).strict(),handler:(a)=>{const terms=[...new Set<string>(a.query.toLowerCase().match(/[\p{L}\p{N}_]+/gu)??[])];const results=a.candidates.map((candidate:any,index:number)=>{const words:string[]=candidate.text.toLowerCase().match(/[\p{L}\p{N}_]+/gu)??[];const counts=terms.map(term=>words.filter(word=>word===term).length);const score=terms.length?counts.reduce((sum,n)=>sum+(n?1+Math.log1p(n)/Math.max(1,Math.log1p(words.length)):0),0)/terms.length:0;return {...candidate,score,index};}).sort((a:any,b:any)=>b.score-a.score||a.index-b.index).slice(0,a.max_results).map(({index,...item}:any)=>item);return {method:'lexical-term-coverage',results};}});
}
