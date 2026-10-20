import {watchFile,unwatchFile} from 'node:fs';
import {readFile,writeFile,mkdir,rename,rm,stat,readdir} from 'node:fs/promises';
import {join,relative,extname,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {AppContext} from '../app.ts';
import {digest,safePath,registerFile,registeredFileRoot,projectKey,fileInContext,publicFile} from '../tools/files.ts';
import {ToolError,type ToolContext,type ToolRegistry} from '../tools/registry.ts';
import {z} from 'zod';

const maxBytes=50*1024*1024;
const fault=(code:string,message:string)=>new ToolError(code,message);
/** Immutable snapshots live outside workspaces, so agent edits cannot rewrite their own history. */
export class FileRevisions {
 private watched=new Map<string,string>();
 private queues=new Map<string,Promise<any>>();
 private closed=false;
 private discovery?:ReturnType<typeof setInterval>;
 private scanning?:Promise<void>;
 constructor(private app:AppContext){}
 private serial<T>(id:string,work:()=>Promise<T>):Promise<T>{const task=(this.queues.get(id)??Promise.resolve()).catch(()=>{}).then(work);this.queues.set(id,task);void task.finally(()=>{if(this.queues.get(id)===task)this.queues.delete(id);}).catch(()=>{});return task;}
 private source(file:any){const root=registeredFileRoot(this.app,file);return safePath(root,relative(root,file.absolutePath));}
 private revisionPath(id:string,revision:number){return join(this.app.dataDirectory,'file-versions',digest(id),String(revision)+'.snapshot');}
 async start(){for(const file of this.app.store.list('files')){if(this.closed)return;try{await this.record(file,'recovered');}catch(error){this.note(file.id,error);}}if(this.closed)return;this.discovery=setInterval(()=>{if(!this.scanning&&!this.closed){this.scanning=this.discover().catch(error=>{this.app.ephemeral.set('fileDiscoveryError',(error as Error).message);}).finally(()=>{this.scanning=undefined;});}},5000);this.discovery.unref();}
 /** Bounded discovery catches terminal-created files, without walking dependencies or symlinks. */
 private async discover(){
  const root=join(this.app.dataDirectory,'workspaces');let scopes;try{scopes=await readdir(root,{withFileTypes:true});}catch(error){if((error as any).code==='ENOENT')return;throw error;}
  const known=new Set(this.app.store.list('files').map(file=>file.absolutePath));let scanned=0;
  const walk=async(scope:string,directory:string,depth=0)=>{if(this.closed||depth>8||scanned>=2000)return;for(const entry of await readdir(directory,{withFileTypes:true})){if(this.closed||scanned>=2000)return;if(entry.isSymbolicLink()||entry.name.startsWith('.')||['node_modules','vendor','target','__pycache__','previews'].includes(entry.name))continue;scanned++;const path=join(directory,entry.name);if(entry.isDirectory())await walk(scope,path,depth+1);else if(entry.isFile()&&!known.has(path)){await this.source({absolutePath:path});const info=await stat(path);if(info.size>maxBytes)continue;await registerFile(this.app,path,scope);known.add(path);}}};
  for(const scope of scopes)if(scope.isDirectory()&&!scope.isSymbolicLink())await walk(scope.name,join(root,scope.name));
 }
 private note(id:string,error:unknown){const file=this.app.store.get('files',id);if(file)this.app.store.put('files',{...file,revisionError:(error as Error).message});}
 async record(file:any,origin='application'){
  if(this.closed)return;
  return this.serial(file.id,async()=>{
   const path=await this.source(file);if((await stat(path)).size>maxBytes)throw fault('FILE_REVISION_TOO_LARGE','File remains available, but revision snapshots are limited to 50 MiB.');const bytes=await readFile(path);if(bytes.length>maxBytes)throw fault('FILE_REVISION_TOO_LARGE','File grew beyond the revision snapshot limit.');
   const hash=digest(bytes),current=this.app.store.get('files',file.id)??file;
   if(current.contentHash!==hash){
    const revision=(current.revision??0)+1,history=this.history(file.id);if(history.reduce((sum,row)=>sum+row.size,0)+bytes.length>512*1024*1024)throw fault('FILE_HISTORY_LIMIT','File history reached 512 MiB. Existing revisions were retained.');
    const snapshot=this.revisionPath(file.id,revision);await mkdir(dirname(snapshot),{recursive:true});try{await writeFile(snapshot,bytes,{flag:'wx'});}catch(error){if((error as any).code!=='EEXIST'||digest(await readFile(snapshot))!==hash)throw error;}
    const record={id:file.id+':'+revision,fileId:file.id,revision,hash,size:bytes.length,origin,createdAt:new Date().toISOString()};
    this.app.store.put('file_revisions',record);this.app.store.put('files',{...current,contentHash:hash,revision,size:bytes.length,revisionError:undefined});
    await this.importArtifactSource(file.id,bytes,hash);if(current.previewFileId&&current.previewSourceHash!==hash)await this.app.ephemeral.get('officeRuntime')?.refreshPreview({...current,contentHash:hash});
   }
   this.watch(file.id,path);return this.app.store.get('files',file.id);
  });
 }
 private watch(id:string,path:string){if(this.watched.has(id)||this.closed)return;this.watched.set(id,path);watchFile(path,{persistent:false,interval:1500},(current,previous)=>{if(current.mtimeMs===previous.mtimeMs&&current.size===previous.size)return;const file=this.app.store.get('files',id);if(file)void this.record(file,'external-edit').catch(error=>this.note(id,error));});}
 history(id:string){return this.app.store.list('file_revisions').filter(row=>row.fileId===id).sort((a,b)=>b.revision-a.revision);}
 private async bytes(id:string,revision:number){const row=this.app.store.get('file_revisions',id+':'+revision);if(!row)throw fault('FILE_REVISION_NOT_FOUND','File revision does not exist');const bytes=await readFile(this.revisionPath(id,revision));if(digest(bytes)!==row.hash)throw fault('FILE_REVISION_CORRUPT','The immutable revision does not match its saved hash');return {row,bytes};}
 async compare(id:string,before:number,after:number){const [a,b]=await Promise.all([this.bytes(id,before),this.bytes(id,after)]);const text=!a.bytes.includes(0)&&!b.bytes.includes(0)&&a.bytes.length<200000&&b.bytes.length<200000;return {before:a.row,after:b.row,text,textBefore:text?a.bytes.toString('utf8'):undefined,textAfter:text?b.bytes.toString('utf8'):undefined,identical:a.row.hash===b.row.hash};}
 async revert(id:string,revision:number,expectedHash:string){
  const file=this.app.store.get('files',id);if(!file)throw fault('FILE_NOT_FOUND','File no longer exists');
  await this.serial(id,async()=>{const path=await this.source(file),current=await readFile(path);if(digest(current)!==expectedHash)throw fault('FILE_CONFLICT','File changed. Review its newest revision before reverting.');const saved=await this.bytes(id,revision),temporary=path+'.'+randomUUID()+'.revert';try{await writeFile(temporary,saved.bytes,{flag:'wx'});if(digest(await readFile(path))!==expectedHash)throw fault('FILE_CONFLICT','File changed during the revert; nothing was replaced');await rename(temporary,path);}finally{await rm(temporary,{force:true});}});
  const updated=await this.record(file,'revert-to-'+revision);return publicFile(updated);
 }
 async attachArtifact(artifact:any,ctx:ToolContext){
  if(ctx.incognito||!artifact?.id||typeof artifact.source!=='string')return artifact;
  const extension=({html:'html',svg:'svg',markdown:'md',mermaid:'mmd',code:'txt',document:'txt'} as any)[artifact.type]??'txt';
  const root=join(this.app.dataDirectory,'workspaces',projectKey(ctx));const path=await safePath(root,'artifacts/'+digest(artifact.id)+'.'+extension);await mkdir(dirname(path),{recursive:true});
  const existing=this.app.store.list('files').find(file=>file.artifactId===artifact.id);
  if(existing?.contentHash){const currentHash=digest(await readFile(path));if(currentHash!==existing.contentHash)throw fault('ARTIFACT_SOURCE_CONFLICT','The saved artifact source was edited externally. Refresh the artifact before publishing another revision.');}
  const temporary=path+'.'+randomUUID()+'.tmp';try{await writeFile(temporary,artifact.source,{flag:'wx'});await rename(temporary,path);}finally{await rm(temporary,{force:true});}
  const registered=await registerFile(this.app,path,projectKey(ctx),artifact.type==='html'?'text/html':artifact.type==='svg'?'image/svg+xml':'text/plain');
  const file=this.app.store.get('files',registered.id)!;this.app.store.put('files',{...file,artifactId:artifact.id,artifactVersion:artifact.version});
  const linked={...artifact,sourceFileId:file.id,sourceHash:digest(artifact.source)};this.app.store.put('artifacts',linked);return linked;
 }
 private async importArtifactSource(fileId:string,bytes:Buffer,hash:string){
  const file=this.app.store.get('files',fileId);if(!file?.artifactId||bytes.length>500000)return;
  const artifact=this.app.store.get('artifacts',file.artifactId);if(!artifact||digest(artifact.source)===hash)return;
  const source=bytes.toString('utf8');if(source.includes('\0'))throw fault('ARTIFACT_SOURCE_INVALID','Artifact source must be text');
  const version=artifact.version+1;this.app.store.put('artifacts',{...artifact,source,sourceHash:hash,version,versions:[...(artifact.versions??[]),{number:version,source,origin:'workspace-file',createdAt:new Date().toISOString()}]});
  this.app.store.put('files',{...file,artifactVersion:version});
 }
 close(){this.closed=true;clearInterval(this.discovery);for(const path of this.watched.values())unwatchFile(path);this.watched.clear();return Promise.allSettled([...this.queues.values(),...(this.scanning?[this.scanning]:[])]);}
}

export function registerRevisionTools(registry:ToolRegistry,service:FileRevisions){
 registry.register({name:'files_versions',capability:'workspace-file',description:'List immutable revisions of a registered workspace file.',input:z.object({file_id:z.string()}).strict(),handler:async(args,ctx)=>{const file=fileInContext(ctx,args.file_id);await service.record(file);return {revisions:service.history(file.id)};}});
 registry.register({name:'files_compare_versions',capability:'workspace-file',description:'Compare two saved file revisions, including bounded source text when available.',input:z.object({file_id:z.string(),before:z.number().int().positive(),after:z.number().int().positive()}).strict(),handler:(args,ctx)=>{fileInContext(ctx,args.file_id);return service.compare(args.file_id,args.before,args.after);}});
 registry.register({name:'files_revert',capability:'workspace-file',description:'Explicitly restore a saved revision after inspecting history. Requires the current file hash; preserves a new revision.',input:z.object({file_id:z.string(),revision:z.number().int().positive(),expected_hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),handler:async(args,ctx)=>{fileInContext(ctx,args.file_id);return {files:[await service.revert(args.file_id,args.revision,args.expected_hash)]};}});
}
