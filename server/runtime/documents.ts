import {registerOwnedProcess} from './managed-process.ts';
import {spawn,execFile,type ChildProcess} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import type {AppContext} from '../app.ts';
import {ToolError,type ToolContext} from '../tools/registry.ts';
import {workspaceRoot,safePath,fileInContext,registerFile,projectKey} from '../tools/files.ts';
import {officeDocumentOperations,type OfficeRuntime} from './office.ts';

export const localDocumentOperations=new Set(['document_inspect','document_edit','document_create','document_extract','pdf_inspect','pdf_edit','spreadsheet_create','spreadsheet_inspect','spreadsheet_edit','spreadsheet_chart','slides_create','slides_inspect','slides_edit','chart_create','image_transform','image_metadata','image_open','document_ocr']);
const fail=(code:string,message:string)=>new ToolError(code,message);
function setupEnvironment(){const env:Record<string,string>={PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8',PIP_CONFIG_FILE:process.platform==='win32'?'NUL':'/dev/null'};for(const key of ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','HOME','USERPROFILE','LOCALAPPDATA','APPDATA','ProgramFiles','ProgramFiles(x86)','HTTP_PROXY','HTTPS_PROXY','NO_PROXY','SSL_CERT_FILE','REQUESTS_CA_BUNDLE'])if(process.env[key])env[key]=process.env[key]!;return env;}
export class DocumentRuntime {
 status:'idle'|'installing'|'ready'|'failed'='idle';error='';log='';private setup?:Promise<void>;private children=new Set<ChildProcess>();private active=0;private stopped=false;
 readonly python:string;
 constructor(private app:AppContext){this.python=join(resolve(app.dataDirectory),'documents','python',process.platform==='win32'?'Scripts/python.exe':'bin/python');}
 get ready(){return this.status==='ready';}
 availability(){return this.stopped?'Document runtime is shutting down':this.status==='failed'?'The local document runtime needs setup: '+this.error:null;}
 snapshot(){return {ready:this.ready,status:this.status,backend:'local-python',docker_required:false,error:this.error||undefined,log:this.log.slice(-1500)};}
 async prepare(){
  if(this.stopped)throw fail('CANCELLED','Document runtime is shutting down');if(this.ready)return;if(this.setup)return this.setup;
  this.setup=this.install().catch(error=>{this.status='failed';this.error=(error as Error).message;throw error;}).finally(()=>{this.setup=undefined;});return this.setup;
 }
 private async waitForSetup(signal:AbortSignal){
  if(signal.aborted)throw fail('CANCELLED','Document operation cancelled');
  await new Promise<void>((resolveSetup,reject)=>{
   let settled=false;
   const finish=(error?:unknown)=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);if(error!==undefined)reject(error);else resolveSetup();};
   const abort=()=>finish(fail('CANCELLED','Document operation cancelled'));
   signal.addEventListener('abort',abort,{once:true});
   this.prepare().then(()=>finish(),finish);
   if(signal.aborted)abort();
  });
 }
 private async install(){
  this.status='installing';this.error='';
  const probe='import reportlab,pypdf,pandas,matplotlib,PIL,pypdfium2; print("ready")';
  try{await this.command(this.python,['-I','-c',probe],{timeout:30000});this.status='ready';return;}catch{}
  await mkdir(join(resolve(this.app.dataDirectory),'documents'),{recursive:true});
  // A venv launcher can still exist after its base interpreter was removed.
  // Check that it actually runs before reusing it for dependency installation.
  try{await this.command(this.python,['-I','-c','import sys;assert sys.version_info >= (3,10)'],{timeout:15000});}catch{
   const candidates=[process.env.OPENCLAUDE_PYTHON,process.env.OPENCLAUDE_BUNDLED_PYTHON?join(process.env.OPENCLAUDE_BUNDLED_PYTHON,process.platform==='win32'?'python.exe':'bin/python3'):undefined,process.platform==='win32'?'python':'python3'].filter(Boolean) as string[];
   let base:string|undefined;for(const candidate of candidates)try{await this.command(candidate,['-I','-c','import sys;assert sys.version_info >= (3,10)'],{timeout:15000});base=candidate;break;}catch{}
   if(!base)throw fail('DOCUMENT_PYTHON_MISSING','Python 3.10 or newer was not found. Repair the bundled Python runtime or install Python, then retry document setup. Docker is not required.');
   await this.command(base,['-I','-m','venv',join(resolve(this.app.dataDirectory),'documents','python')],{timeout:120000});
   // Rebinding a broken venv preserves its installed packages; avoid an
   // unnecessary network installation when those packages already work.
   try{await this.command(this.python,['-I','-c',probe],{timeout:30000});this.status='ready';return;}catch{}
  }
  await this.command(this.python,['-I','-m','pip','install','--disable-pip-version-check','--only-binary=:all:','--index-url','https://pypi.org/simple','-r',join(this.app.root,'runtime','worker','pdf-requirements.txt')],{timeout:300000});
  await this.command(this.python,['-I','-c',probe],{timeout:30000});this.status='ready';
 }
 private kill(child:ChildProcess){if(!this.children.has(child))return;const supervisor=this.app.ephemeral.get('processSupervisor');if(supervisor){void supervisor.stopChild(child).catch((error:unknown)=>{this.error=(error as Error).message;});}else child.kill('SIGTERM');}
 private command(binary:string,args:string[],options:{timeout:number;cwd?:string;input?:string;signal?:AbortSignal;env?:Record<string,string>}):Promise<string>{
  return new Promise((resolve,reject)=>{
   if(this.stopped||options.signal?.aborted){reject(fail('CANCELLED','Document operation cancelled'));return;}
   const child=spawn(binary,args,{cwd:options.cwd??this.app.root,windowsHide:true,detached:process.platform!=='win32',shell:false,stdio:['pipe','pipe','pipe'],env:options.env??setupEnvironment()});this.children.add(child);registerOwnedProcess(this.app,child,'document-worker',binary,process.platform!=='win32');let output='',errors='',failure:Error|undefined;
   const abort=()=>{failure=fail('CANCELLED','Document operation cancelled');this.kill(child);};const timer=setTimeout(()=>{failure=fail('DOCUMENT_TIMEOUT','Document operation timed out; inspect returned files before retrying a write.');this.kill(child);},options.timeout);
   options.signal?.addEventListener('abort',abort,{once:true});
   const cleanup=()=>{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);this.children.delete(child);};
   child.stdout.on('data',chunk=>{output+=chunk.toString('utf8');if(output.length>4*1024*1024){failure=fail('DOCUMENT_OUTPUT_LIMIT','Document response exceeded its output limit');this.kill(child);}});
   child.stderr.on('data',chunk=>{errors=(errors+chunk.toString('utf8')).slice(-12000);this.log=(this.log+chunk.toString('utf8')).slice(-20000);});
   child.on('error',error=>{cleanup();reject(error);});child.on('close',code=>{cleanup();if(failure)reject(failure);else if(code!==0)reject(fail('DOCUMENT_WORKER_FAILED',errors.trim()||'Document worker exited with code '+code));else resolve(output);});
   child.stdin.on('error',()=>{});child.stdin.end(options.input??'');
  });
 }
 async request(operation:string,input:any,ctx:ToolContext){
  const source=input.file_id?fileInContext(ctx,input.file_id):undefined;
  const officeRequest=officeDocumentOperations.has(operation)||(operation==='document_create'&&input.format==='docx')||(operation==='document_extract'&&/\.(docx|xlsx|pptx)$/i.test(source?.absolutePath??input.file_path??''));
  if(officeRequest){const office=this.app.ephemeral.get('officeRuntime') as OfficeRuntime|undefined;if(!office)throw fail('OFFICE_RUNTIME_MISSING','OfficeCLI runtime is required for Word, Excel and PowerPoint operations');return office.request(operation,input,ctx);}
  if(!localDocumentOperations.has(operation))throw fail('DOCUMENT_OPERATION_UNSUPPORTED','The local document worker does not execute arbitrary scripts or shell commands');
  if(ctx.signal.aborted)throw fail('CANCELLED','Document operation cancelled');
  if(this.active>=2)throw fail('DOCUMENT_WORKER_BUSY','Two document jobs are running. Wait for them to finish before starting another.');this.active++;
  try{
   ctx.emit('model.status',{messageId:ctx.messageId,phase:'working'});await this.waitForSetup(ctx.signal);if(ctx.signal.aborted)throw fail('CANCELLED','Document operation cancelled');
   const root=resolve(workspaceRoot(ctx));await mkdir(root,{recursive:true});let args={...input};const fileId=args.file_id??args.data_file_id;
   if(fileId){const file=fileInContext(ctx,fileId);const path=relative(root,file.absolutePath);await safePath(root,path);args.file_path=path;}
   if(args.file_path)await safePath(root,args.file_path);
   for(const directory of ['outputs','previews','.document-cache'])await mkdir(await safePath(root,directory),{recursive:true});
   const environment:Record<string,string>={};for(const key of ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','HOME','USERPROFILE','LOCALAPPDATA'])if(process.env[key])environment[key]=process.env[key]!;
   Object.assign(environment,{PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8',OPENCLAUDE_DOCUMENT_ROOT:root,MPLCONFIGDIR:join(root,'.document-cache')});
   const text=await this.command(this.python,['-I','-u',join(this.app.root,'runtime','worker','documents.py')],{cwd:root,timeout:120000,signal:ctx.signal,input:JSON.stringify({operation,args}),env:environment});
   let result:any;try{result=JSON.parse(text);}catch{throw fail('DOCUMENT_INVALID_RESULT','Document worker returned an invalid result; no completion is confirmed');}
   if(!result||typeof result!=='object'||Array.isArray(result)||!Array.isArray(result.files??[]))throw fail('DOCUMENT_INVALID_RESULT','Invalid document result shape');
   const files=[];for(const file of (result.files??[]).slice(0,100)){const path=typeof file==='string'?file:file.path;if(typeof path!=='string')throw fail('DOCUMENT_INVALID_RESULT','Document output has no valid workspace path');files.push(await registerFile(this.app,await safePath(root,path),projectKey(ctx),file.mediaType??'application/octet-stream'));}
   if(files.length>1){const primary=this.app.store.get('files',files[0].id)!;for(let i=1;i<files.length;i++){const preview=this.app.store.get('files',files[i].id)!;this.app.store.put('files',{...preview,sourceFileId:primary.id});files[i]={...files[i],sourceFileId:primary.id};}}
   return {...result,files,runtime:'local-python',docker_required:false};
  }finally{this.active--;}
 }
 close(){this.stopped=true;for(const child of this.children)this.kill(child);}
}
