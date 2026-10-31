import {registerOwnedProcess} from './managed-process.ts';
import {spawn,execFile,type ChildProcess} from 'node:child_process';
import {mkdir,readFile,writeFile,rename,rm,chmod,stat,copyFile} from 'node:fs/promises';
import {join,resolve,relative,extname,basename} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import JSZip from 'jszip';
import type {AppContext} from '../app.ts';
import {ToolError,type ToolContext} from '../tools/registry.ts';
import {workspaceRoot,safePath,fileInContext,registerFile,projectKey} from '../tools/files.ts';

// Commands and schemas verified against the immutable upstream v1.0.157 tag.
// https://github.com/iOfficeAI/OfficeCLI/tree/v1.0.157
export const OFFICECLI_VERSION='1.0.157';
export const officeDocumentOperations=new Set(['document_inspect','document_edit','spreadsheet_create','spreadsheet_edit','spreadsheet_inspect','spreadsheet_chart','slides_create','slides_edit','slides_inspect']);
const assets:Record<string,[string,string]>={
 'win32-x64':['officecli-win-x64.exe','bd64eba587e56cc71709cdd1f38ae9ac77cd65a9c8ea744b0996897c0557e343'],
 'win32-arm64':['officecli-win-arm64.exe','786e08b1ccf09c3a2107912537fe25fa82970b30145e3c59e09d83bf4032b065'],
 'linux-x64':['officecli-linux-x64','f8eefe88dbfa7464bee421e5421efe57fc26bc3180b30e56eef58594c8245c94'],
 'linux-arm64':['officecli-linux-arm64','60db926c8a1371984b9e99622a834777befb02b6f73d0f3fff914ffcc2760d2f'],
 'darwin-x64':['officecli-mac-x64','178c1e9ebaf44c24d2b4b359064a5dea6eb7b2f539809871a3de1c09599dff9f'],
 'darwin-arm64':['officecli-mac-arm64','0dae0990a9cc29688a5d54469f984c34e5b15ab6bbd194a0ffdc571bb9040124'],
};
export type OfficeBatchItem={command:'add'|'set'|'remove'|'move';path?:string;parent?:string;type?:string;props?:Record<string,string|number|boolean>;index?:number;to?:string};
type OfficeNode={path:string;type:string;text?:string;preview?:string;childCount?:number;format:Record<string,any>;children:OfficeNode[]};
type CellValue=string|number|boolean|null;
export type OfficeSheet={name:string;rows?:CellValue[][];create?:boolean;cells?:{cell:string;value:CellValue}[];formats?:{range:string;number_format?:string;bold?:boolean;font_color?:string;font_size?:number;fill?:string;alignment?:string;wrap_text?:boolean}[];freeze_panes?:string|null;auto_filter?:string|null;column_widths?:Record<string,number>};
export type OfficeSlide={title:string;body?:string;layout?:'content'|'section';bullets?:string[];table?:{headers:string[];rows:string[][]};notes?:string};
const fail=(code:string,message:string)=>new ToolError(code,message);
function sheetPath(name:string){if(!name||name.length>31||/[\\/\[\]:*?\x00-\x1f]/.test(name))throw fail('OFFICE_INVALID_SHEET','Sheet names must be 1–31 characters without Excel path metacharacters');return '/'+name;}
function column(index:number){let result='';for(;index;index=Math.floor((index-1)/26))result=String.fromCharCode(65+(index-1)%26)+result;return result;}
const literal=(text:string)=>text.replaceAll('\\','\\\\');
/** Compare package contents, ignoring ZIP timestamps and document audit metadata. */
export async function officeContentEqual(before:Buffer,after:Buffer){
 const [a,b]=await Promise.all([JSZip.loadAsync(before),JSZip.loadAsync(after)]);
 const names=(zip:JSZip)=>Object.keys(zip.files).filter(name=>!zip.files[name].dir&&name!=='docProps/core.xml').sort();const left=names(a),right=names(b);
 if(left.length!==right.length||left.some((name,index)=>name!==right[index]))return false;
 for(const name of left)if(!(await a.file(name)!.async('nodebuffer')).equals(await b.file(name)!.async('nodebuffer')))return false;
 return true;
}
function cellProps(value:CellValue):Record<string,string|boolean|number>{if(value===null)return {value:''};if(typeof value==='string'&&value.startsWith('=')){if(!value.slice(1).trim())throw fail('INVALID_ARGUMENTS','Keep the whole formula in one cell, for example =SUM(B2:B3); do not split = and SUM into separate cells.');return {formula:value.slice(1)};}return {value:typeof value==='boolean'?String(value):typeof value==='string'?literal(value):value,type:typeof value==='string'?'string':typeof value==='boolean'?'boolean':'number'};}
export function spreadsheetBatch(sheets:OfficeSheet[],create=false):OfficeBatchItem[]{
 const ops:OfficeBatchItem[]=[];
 if(create){const names=sheets.map(s=>s.name);if(new Set(names).size!==names.length)throw fail('OFFICE_INVALID_SHEET','Duplicate sheet names');}
 sheets.forEach((sheet,index)=>{
  const path=sheetPath(sheet.name);
  if(create){if(index===0)ops.push({command:'set',path:'/Sheet1',props:{name:sheet.name}});else ops.push({command:'add',parent:'/',type:'sheet',props:{name:sheet.name}});}
  for(const [r,row] of (sheet.rows??[]).entries())for(const [c,value] of row.entries())if(value!==null)ops.push({command:'set',path:path+'/'+column(c+1)+(r+1),props:cellProps(value)});
  for(const cell of sheet.cells??[])ops.push({command:'set',path:path+'/'+cell.cell,props:cellProps(cell.value)});
  for(const format of sheet.formats??[]){const props:Record<string,string|boolean|number>={};const mapping={number_format:'numberformat',bold:'font.bold',font_color:'font.color',font_size:'font.size',fill:'fill',alignment:'alignment.horizontal',wrap_text:'alignment.wrapText'};for(const [key,target] of Object.entries(mapping)){const value=(format as any)[key];if(value!==undefined)props[target]=value;}if(Object.keys(props).length)ops.push({command:'set',path:path+'/'+format.range,props});}
  for(const [col,width] of Object.entries(sheet.column_widths??{}))ops.push({command:'set',path:path+'/col['+col+']',props:{width}});
  if(sheet.freeze_panes!==undefined)ops.push({command:'set',path,props:{freeze:sheet.freeze_panes??'none'}});
  if(sheet.auto_filter!==undefined)ops.push({command:'set',path,props:{autoFilter:sheet.auto_filter??'false'}});
 });return ops;
}
export function documentBatch(input:{title:string;blocks:{type:string;text?:string;rows?:string[][]}[]},tableOffset=0):OfficeBatchItem[]{
 const ops:OfficeBatchItem[]=[{command:'add',parent:'/body',type:'paragraph',props:{text:literal(input.title),style:'Title'}}];let table=tableOffset;
 for(const block of input.blocks){if(block.type!=='table'){ops.push({command:'add',parent:'/body',type:'paragraph',props:{text:literal(block.text??''),...(block.type==='heading'?{style:'Heading1'}:{})}});continue;}
  const rows=block.rows??[];if(!rows.length)continue;table++;ops.push({command:'add',parent:'/body',type:'table',props:{rows:rows.length,cols:Math.max(...rows.map(r=>r.length))}});rows.forEach((row,index)=>ops.push({command:'set',path:`/body/tbl[${table}]/tr[${index+1}]`,props:Object.fromEntries(row.map((value,i)=>['c'+(i+1),literal(value)]))}));
 }return ops;
}
export function slideBatch(slides:OfficeSlide[],theme:{background?:string;foreground?:string;accent?:string;font?:string}={},offset=0):OfficeBatchItem[]{
 const ops:OfficeBatchItem[]=[];
 slides.forEach((slide,index)=>{
  const path=`/slide[${offset+index+1}]`;ops.push({command:'add',parent:'/',type:'slide',props:{layout:'blank',background:theme.background??'FFFFFF'}});
  ops.push({command:'add',parent:path,type:'shape',props:{text:literal(slide.title),x:'1.5cm',y:slide.layout==='section'?'6cm':'1cm',width:'30cm',height:'2.5cm',size:32,bold:true,color:theme.accent??theme.foreground??'222222',font:theme.font??'Calibri'}});
  const text=[slide.body??'',...(slide.bullets??[]).map(item=>'• '+item)].filter(Boolean).join('\n');
  if(text)ops.push({command:'add',parent:path,type:'shape',props:{text:literal(text),x:'1.5cm',y:slide.layout==='section'?'9cm':'4cm',width:'30cm',height:slide.table?'3.5cm':'12cm',size:20,color:theme.foreground??'333333',font:theme.font??'Calibri'}});
  if(slide.table){const rows=[slide.table.headers,...slide.table.rows];ops.push({command:'add',parent:path,type:'table',props:{rows:rows.length,cols:slide.table.headers.length,x:'1.5cm',y:text?'8cm':'4cm',width:'30cm',height:'9cm'}});rows.forEach((row,r)=>ops.push({command:'set',path:path+`/table[1]/tr[${r+1}]`,props:Object.fromEntries(row.map((v,c)=>['c'+(c+1),literal(v)]))}));}
  if(slide.notes!==undefined)ops.push({command:'set',path,props:{notes:literal(slide.notes)}});
 });return ops;
}

export class OfficeRuntime {
 status:'idle'|'downloading'|'installing'|'ready'|'failed'='idle';error='';log='';version='';private setup?:Promise<void>;private children=new Set<ChildProcess>();private active=0;private stopped=false;private setupAbort?:AbortController;
 downloadProgress:{receivedBytes:number;totalBytes:number|null}|null=null;
 readonly binary:string;readonly asset?:[string,string];
 constructor(private app:AppContext){this.asset=assets[process.platform+'-'+process.arch];this.binary=join(resolve(app.dataDirectory),'officecli',OFFICECLI_VERSION,this.asset?.[0]??'unsupported-platform');}
 get ready(){return this.status==='ready';}
 availability(){return this.stopped?'OfficeCLI is shutting down':this.status==='failed'?'OfficeCLI setup required: '+this.error:null;}
 snapshot(){return {ready:this.ready,status:this.status,downloadProgress:this.downloadProgress,backend:'officecli',version:this.version||undefined,pinned_version:OFFICECLI_VERSION,binary:this.binary,checksum:this.asset?.[1],docker_required:false,error:this.error||undefined,log:this.log.slice(-1500),limitations:['No PDF export; OfficeCLI HTML previews are provided.','Formula results depend on OfficeCLI function support and are not certified as Excel recalculation.']};}
 handles(operation:string,input:any,ctx?:ToolContext){return officeDocumentOperations.has(operation)||(operation==='document_create'&&input.format==='docx')||(operation==='document_extract'&&Boolean(ctx&&/\.(docx|xlsx|pptx)$/i.test(fileInContext(ctx,input.file_id).absolutePath)));}
 async prepare(){if(this.stopped)throw fail('CANCELLED','OfficeCLI is shutting down');if(this.ready)return;if(this.setup)return this.setup;this.setup=this.install().catch(error=>{this.status='failed';this.error=(error as Error).message;throw error;}).finally(()=>{this.setup=undefined;});return this.setup;}
 private async waitForSetup(signal:AbortSignal){signal.throwIfAborted();await new Promise<void>((resolveSetup,reject)=>{const abort=()=>reject(fail('CANCELLED','Office operation cancelled'));signal.addEventListener('abort',abort,{once:true});this.prepare().then(resolveSetup,reject).finally(()=>signal.removeEventListener('abort',abort));});}
 private async install(){
  this.status='installing';this.downloadProgress=null;this.error='';if(!this.asset)throw fail('OFFICE_PLATFORM_UNSUPPORTED','No pinned OfficeCLI binary for this platform');
  const directory=join(resolve(this.app.dataDirectory),'officecli',OFFICECLI_VERSION);await mkdir(directory,{recursive:true});
  const valid=async()=>{try{return createHash('sha256').update(await readFile(this.binary)).digest('hex')===this.asset![1];}catch{return false;}};
  if(!await valid()){
   this.status='downloading';
   this.setupAbort=new AbortController();const timeout=setTimeout(()=>this.setupAbort?.abort(),180000);const temporary=this.binary+'.'+randomUUID()+'.download';
   try{
    const response=await fetch(`https://github.com/iOfficeAI/OfficeCLI/releases/download/v${OFFICECLI_VERSION}/${this.asset[0]}`,{signal:this.setupAbort.signal});
    if(!response.ok||!response.body)throw fail('OFFICE_DOWNLOAD_FAILED','Pinned OfficeCLI download failed: HTTP '+response.status);
    const total=Number(response.headers.get('content-length'));this.downloadProgress={receivedBytes:0,totalBytes:total>0?total:null};
    const chunks:Uint8Array[]=[];let size=0;for await(const chunk of response.body as any){size+=chunk.length;this.downloadProgress.receivedBytes=size;if(size>250*1024*1024)throw fail('OFFICE_DOWNLOAD_LIMIT','OfficeCLI download exceeds 250 MiB');chunks.push(chunk);}const bytes=Buffer.concat(chunks);this.status='installing';
    if(createHash('sha256').update(bytes).digest('hex')!==this.asset[1])throw fail('OFFICE_CHECKSUM_FAILED','OfficeCLI checksum mismatch; binary was not installed');
    if(this.stopped)throw fail('CANCELLED','OfficeCLI setup cancelled');await writeFile(temporary,bytes,{flag:'wx'});await chmod(temporary,0o700);await rename(temporary,this.binary);
   }finally{clearTimeout(timeout);this.setupAbort=undefined;await rm(temporary,{force:true});}
  }
  const version=(await this.command(['--version'],{timeout:15000})).trim();if(version!==OFFICECLI_VERSION)throw fail('OFFICE_VERSION_MISMATCH','Expected OfficeCLI '+OFFICECLI_VERSION+'; got '+version);this.version=version;this.downloadProgress=null;this.status='ready';
 }
 private kill(child:ChildProcess){if(!this.children.has(child))return;const supervisor=this.app.ephemeral.get('processSupervisor');if(supervisor){void supervisor.stopChild(child).catch((error:unknown)=>{this.error=(error as Error).message;});}else child.kill('SIGTERM');}
 private command(args:string[],options:{timeout?:number;cwd?:string;input?:string;signal?:AbortSignal}={}):Promise<string>{
  return new Promise((resolveResult,reject)=>{
   if(this.stopped||options.signal?.aborted){reject(fail('CANCELLED','Office operation cancelled'));return;}
   const env:Record<string,string>={OFFICECLI_SKIP_UPDATE:'1',OFFICECLI_NO_AUTO_INSTALL:'1',OFFICECLI_NO_AUTO_RESIDENT:'1',OFFICECLI_RESIDENT_FLUSH:'each'};for(const key of ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','HOME','USERPROFILE','LOCALAPPDATA','APPDATA'])if(process.env[key])env[key]=process.env[key]!;
   const child=spawn(this.binary,args,{cwd:options.cwd??this.app.root,env,shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});this.children.add(child);registerOwnedProcess(this.app,child,'officecli',this.binary,process.platform!=='win32');let output='',errors='',failure:Error|undefined;
   const abort=()=>{failure=fail('CANCELLED','Office operation cancelled');this.kill(child);};const timer=setTimeout(()=>{failure=fail('OFFICE_TIMEOUT','OfficeCLI timed out; no completion is confirmed');this.kill(child);},options.timeout??120000);
   options.signal?.addEventListener('abort',abort,{once:true});const cleanup=()=>{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);this.children.delete(child);};
   child.stdout.on('data',chunk=>{output+=chunk.toString('utf8');if(output.length>8*1024*1024){failure=fail('OFFICE_OUTPUT_LIMIT','OfficeCLI response exceeded 8 MiB');this.kill(child);}});child.stderr.on('data',chunk=>{errors=(errors+chunk.toString('utf8')).slice(-12000);this.log=(this.log+chunk.toString('utf8')).slice(-20000);});
   child.once('error',error=>{cleanup();reject(error);});child.once('close',code=>{cleanup();if(failure)reject(failure);else if(code!==0)reject(fail('OFFICE_COMMAND_FAILED',errors.trim()||output.slice(-3000)||'OfficeCLI exited with code '+code));else resolveResult(output);});child.stdin.on('error',()=>{});child.stdin.end(options.input??'');
  });
 }
 private async json(args:string[],signal:AbortSignal,cwd:string){const text=await this.command([...args,'--json'],{signal,cwd});let result:any;try{result=JSON.parse(text);}catch{throw fail('OFFICE_INVALID_RESULT','OfficeCLI did not return valid JSON');}if(result?.success!==true||!result.data)throw fail('OFFICE_INVALID_RESULT','OfficeCLI returned an unsuccessful result');if(result.data.summary?.failed||result.data.results?.some((item:any)=>item.success===false))throw fail('OFFICE_BATCH_FAILED','An OfficeCLI batch item failed; no output is delivered');if(result.warnings?.some((warning:any)=>/unsupported|autocorrect/i.test(String(warning.code))))throw fail('OFFICE_PROPERTY_UNSUPPORTED','OfficeCLI reported an unsupported property');return result.data;}
 private async get(file:string,path:string,depth:number,ctx:ToolContext,root:string):Promise<OfficeNode>{const result=await this.json(['get',file,path,'--depth',String(depth)],ctx.signal,root);const node=result.results?.[0];if(!node||typeof node.path!=='string'||!Array.isArray(node.children))throw fail('OFFICE_INVALID_RESULT','OfficeCLI returned no document node');return node;}
 /** Refresh a previously linked preview; never edit the source or install a runtime in the watcher. */
 async refreshPreview(file:any){
  if(!this.ready||this.stopped||this.active>=2)return;
  const root=join(resolve(this.app.dataDirectory),'workspaces',file.scope);const source=await safePath(root,relative(root,file.absolutePath));if(!/\.(docx|xlsx|pptx)$/i.test(source)||(await stat(source)).size>50*1024*1024)return;
  const sourceBytes=await readFile(source);const archive=await JSZip.loadAsync(sourceBytes);const entries=Object.values(archive.files);if(entries.length>20000||entries.reduce((total,entry)=>total+((entry as any)._data?.uncompressedSize??0),0)>256*1024*1024)throw fail('OFFICE_INPUT_LIMIT','Office preview archive exceeds expanded processing limits');const hash=createHash('sha256').update(sourceBytes).digest('hex');const directory=await safePath(root,'previews');await mkdir(directory,{recursive:true});const token=randomUUID(),copy=join(directory,'.preview-'+token+extname(source)),preview=join(directory,token+'.html');this.active++;
  try{await writeFile(copy,sourceBytes,{flag:'wx'});await this.command(['view',copy,'html','-o',preview],{signal:AbortSignal.timeout(60000),cwd:root});if(createHash('sha256').update(await readFile(source)).digest('hex')!==hash){await rm(preview,{force:true});return;}const rendered=await registerFile(this.app,preview,file.scope,'text/html');this.app.store.put('files',{...this.app.store.get('files',rendered.id),id:rendered.id,sourceFileId:file.id});const current=this.app.store.get('files',file.id)!;this.app.store.put('files',{...current,previewFileId:rendered.id,previewSourceHash:hash,previewError:undefined});}
  catch(error){const current=this.app.store.get('files',file.id);if(current)this.app.store.put('files',{...current,previewError:(error as Error).message});}
  finally{await rm(copy,{force:true});this.active--;}
 }
 async request(operation:string,input:any,ctx:ToolContext):Promise<any>{
  if(!this.handles(operation,input,ctx))throw fail('OFFICE_OPERATION_UNSUPPORTED','Operation is not supported by the OfficeCLI adapter');if(this.active>=2)throw fail('OFFICE_WORKER_BUSY','Two Office jobs are running; wait for one to finish');this.active++;
  let temporary:string|undefined;const deadline=new AbortController();const deadlineTimer=setTimeout(()=>deadline.abort(fail('OFFICE_TIMEOUT','Office job exceeded its five minute limit')),300000);ctx={...ctx,signal:AbortSignal.any([ctx.signal,deadline.signal])};
  try{
   ctx.signal.throwIfAborted();ctx.emit('model.status',{messageId:ctx.messageId,phase:'working'});await this.waitForSetup(ctx.signal);ctx.signal.throwIfAborted();const root=resolve(workspaceRoot(ctx));await mkdir(root,{recursive:true});let source:string|undefined;
   if(input.file_id){const file=fileInContext(ctx,input.file_id);source=await safePath(root,relative(root,file.absolutePath));if((await stat(source)).size>50*1024*1024)throw fail('OFFICE_INPUT_LIMIT','Office input exceeds 50 MiB');const expected=operation.startsWith('spreadsheet')?'.xlsx':operation.startsWith('slides')?'.pptx':operation==='document_inspect'||operation==='document_edit'?'.docx':undefined;if(expected&&extname(source).toLowerCase()!==expected)throw fail('OFFICE_FORMAT_MISMATCH','Expected '+expected+' input');const archive=await JSZip.loadAsync(await readFile(source));const entries=Object.values(archive.files);if(entries.length>20000||entries.reduce((total,entry)=>total+((entry as any)._data?.uncompressedSize??0),0)>256*1024*1024)throw fail('OFFICE_INPUT_LIMIT','Office archive exceeds expanded processing limits');}
   if(operation==='document_extract'){
    // Word's `view text` intentionally summarizes tables. Read the OfficeCLI
    // DOM to include their actual text, rather than silently losing table cells.
    const node=await this.get(source!,extname(source!).toLowerCase()==='.docx'?'/body':'/',10,ctx,root);const texts:string[]=[];let depthLimited=false;
    const visit=(item:OfficeNode,depth=0)=>{if(depth>=10&&(item.childCount??0)>item.children.length)depthLimited=true;if(item.children.length){for(const child of item.children)visit(child,depth+1);}else if(item.text)texts.push(item.text);};visit(node);const text=texts.join('\n');return {text:text.slice(0,30000),truncated:text.length>30000||depthLimited,files:[],runtime:'officecli',docker_required:false};
   }
   if(operation==='document_inspect'){const node=await this.get(source!,input.path??'/body',input.depth??3,ctx,root);return {node,files:[],runtime:'officecli',docker_required:false};}
   if(operation==='slides_inspect')return {...await this.inspectSlides(source!,ctx,root),files:[],runtime:'officecli',docker_required:false};
   if(operation==='spreadsheet_inspect')return {...await this.inspectSpreadsheet(source!,input,ctx,root),files:[],runtime:'officecli',docker_required:false};
   const extension=operation.startsWith('spreadsheet')?'xlsx':operation.startsWith('slides')?'pptx':'docx';const name=basename(String(input.output_name??'document')).replace(/\.(xlsx|pptx|docx)$/i,'');if(!name||/[<>:"|?*\x00-\x1f]/.test(name))throw fail('OFFICE_INVALID_NAME','Invalid output filename');
   const directory=await safePath(root,'outputs');await mkdir(directory,{recursive:true});const target=await safePath(root,join('outputs',name+'-'+randomUUID().slice(0,8)+'.'+extension));temporary=await safePath(root,join('outputs','.office-'+randomUUID()+'.'+extension));
   if(source)await copyFile(source,temporary);else await this.command(['create',temporary],{signal:ctx.signal,cwd:root});
   let ops:OfficeBatchItem[]=[];
   if(operation==='spreadsheet_create')ops=spreadsheetBatch(input.sheets,true);
   else if(operation==='spreadsheet_edit'){
    for(const sheet of input.sheets as OfficeSheet[]){const current=await this.json(['get',temporary,sheetPath(sheet.name),'--depth','0'],ctx.signal,root).catch(error=>{if(!sheet.create)throw error;return null;});if(!current?.results?.length){if(!sheet.create)throw fail('OFFICE_SHEET_NOT_FOUND','Requested sheet does not exist');ops.push({command:'add',parent:'/',type:'sheet',props:{name:sheet.name}});}}ops.push(...spreadsheetBatch(input.sheets));
   }else if(operation==='spreadsheet_chart'){const match=/^([A-Z]+)([0-9]+)$/.exec(input.anchor??'E2')!;const toNumber=(s:string)=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);const anchor=(input.anchor??'E2')+':'+column(toNumber(match[1])+9)+(Number(match[2])+17);ops=[{command:'add',parent:sheetPath(input.sheet),type:'chart',props:{chartType:input.chart_type,title:input.title??'Chart',dataRange:"'"+input.sheet.replaceAll("'","''")+"'!"+input.range,anchor}}];}
   else if(operation==='document_create')ops=documentBatch(input);
   else if(operation==='document_edit'){for(const change of input.changes??[]){const node=await this.get(temporary,change.path,0,ctx,root);if(change.expected_text!==undefined&&node.text!==change.expected_text)throw fail('OFFICE_EDIT_CONFLICT','The inspected document text changed; inspect it again before editing');ops.push({command:'set',path:change.path,props:{text:literal(change.text)}});}if(input.append_blocks?.length){const body=await this.get(temporary,'/body',1,ctx,root);const tables=body.children.filter(node=>/\/tbl\[/.test(node.path)).length;ops.push(...documentBatch({title:'',blocks:input.append_blocks},tables).slice(1));}}
   else if(operation==='slides_create')ops=slideBatch(input.slides,input.theme);
   else if(operation==='slides_edit'){
    if(input.order)throw fail('OFFICE_OPERATION_UNSUPPORTED','Slide selection/reordering is not implemented by this adapter');const deck=await this.inspectSlides(temporary,ctx,root);
    for(const change of input.changes??[]){const shape=deck.slides.find((s:any)=>s.slide===change.slide)?.shapes.find((s:any)=>s.shape_id===change.shape_id);if(!shape||typeof shape.text!=='string')throw fail('OFFICE_SHAPE_NOT_FOUND','Inspect slides and select an existing text shape ID');ops.push({command:'set',path:shape.path,props:{text:literal(change.text),...(change.font_size!==undefined?{size:change.font_size}:{}),...(change.color!==undefined?{color:change.color}:{}),...(change.bold!==undefined?{bold:change.bold}:{})}});}
    for(const note of input.notes??[]){if(!deck.slides.some((s:any)=>s.slide===note.slide))throw fail('OFFICE_SLIDE_NOT_FOUND','Slide number does not exist');ops.push({command:'set',path:`/slide[${note.slide}]`,props:{notes:literal(note.text)}});}ops.push(...slideBatch(input.add_slides??[],{},deck.slide_count));
   }
   if(ops.length>100000)throw fail('OFFICE_OPERATION_LIMIT','Office operations exceed 100000 commands');
   for(let i=0;i<ops.length;i+=80){const result=JSON.parse(await this.command(['batch',temporary,'--json'],{signal:ctx.signal,cwd:root,input:JSON.stringify(ops.slice(i,i+80))}));if(result.success!==true||result.data?.summary?.failed||result.data?.results?.some((item:any)=>!item.success))throw fail('OFFICE_BATCH_FAILED','OfficeCLI batch failed; no file is delivered');const warnings=[...(result.warnings??[]),...(result.data?.results??[]).flatMap((item:any)=>item.warnings??[])];if(warnings.some((w:any)=>/unsupported|autocorrect/i.test(JSON.stringify(w))))throw fail('OFFICE_PROPERTY_UNSUPPORTED','OfficeCLI reported unsupported or corrected properties; no file is delivered');}
    await this.command(['close',temporary],{signal:ctx.signal,cwd:root});await this.json(['validate',temporary],ctx.signal,root);await this.get(temporary,'/',0,ctx,root);
    if(operation==='spreadsheet_edit'&&source&&await officeContentEqual(await readFile(source),await readFile(temporary)))throw fail('OFFICE_NO_CHANGES','The edit left the workbook unchanged; no duplicate was delivered. To add or update values use sheets:[{name:"actual sheet name",cells:[{cell:"A5",value:"Summary"},{cell:"B5",value:"=COUNTA(A2:A3)"}]}]. Choose actual empty cell addresses from spreadsheet_inspect; keep existing totals. Formats and freeze settings do not add cells.');
    await rename(temporary,target);temporary=undefined;
   const mime=extension==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':extension==='pptx'?'application/vnd.openxmlformats-officedocument.presentationml.presentation':'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
   const files=[await registerFile(this.app,target,projectKey(ctx),mime)];let preview_error:string|undefined;
   try{const preview=await safePath(root,join('previews',randomUUID()+'.html'));await mkdir(join(root,'previews'),{recursive:true});await this.command(['view',target,'html','-o',preview],{signal:ctx.signal,cwd:root});const rendered=await registerFile(this.app,preview,projectKey(ctx),'text/html');files.push({...rendered,sourceFileId:files[0].id});const primary=this.app.store.get('files',files[0].id)!;this.app.store.put('files',{...primary,previewFileId:rendered.id,previewSourceHash:primary.contentHash});this.app.store.put('files',{...this.app.store.get('files',rendered.id),id:rendered.id,sourceFileId:primary.id});files[0]={...files[0],previewFileId:rendered.id};}catch(error){preview_error=(error as Error).message;}
   return {files,runtime:'officecli',officecli_version:this.version,docker_required:false,preview_error,formulas_recalculated:false,...(operation==='slides_edit'?{text_fit_review_required:true}:{})};
  }finally{clearTimeout(deadlineTimer);if(temporary)await rm(temporary,{force:true}).catch(()=>{});this.active--;}
 }
 private async inspectSlides(file:string,ctx:ToolContext,root:string){
  const deck=await this.get(file,'/',0,ctx,root);const count=deck.childCount??0;const slides:any[]=[];let truncated=count>100;
  for(let i=1;i<=Math.min(count,100);i++){
   const slide=await this.get(file,`/slide[${i}]`,1,ctx,root);const shapes:any[]=[];if(slide.children.length>100)truncated=true;
   for(const shape of slide.children.slice(0,100)){
    let table:string[][]|null=null;if(shape.type==='table'){const content=await this.get(file,shape.path,3,ctx,root);table=content.children.filter(row=>row.type==='tr').slice(0,20).map(row=>row.children.map(cell=>(cell.text??'').slice(0,1000)));if(content.children.length>20)truncated=true;}
    if((shape.text?.length??0)>6000)truncated=true;shapes.push({shape_id:shape.format?.id,path:shape.path,name:shape.format?.name,text:shape.text?.slice(0,6000)??null,table,type:shape.type});
   }
   const notes=String(slide.format?.notes??'');if(notes.length>6000)truncated=true;slides.push({slide:i,notes:notes.slice(0,6000),shapes});
  }return {slide_count:count,slides,truncated};
 }
 private async inspectSpreadsheet(file:string,input:any,ctx:ToolContext,root:string){
  const all=await this.get(file,'/',1,ctx,root);const maxRows=input.max_rows??100,maxCols=input.max_columns??50;const sheets:any[]=[];
  const selected=all.children.filter(sheet=>sheet.type==='sheet'&&(!input.sheet||sheet.preview===input.sheet||sheet.path==='/'+input.sheet));if(input.sheet&&!selected.length)throw fail('OFFICE_SHEET_NOT_FOUND','Requested sheet does not exist');
  for(const sheet of selected.slice(0,20)){
   // Read sparse nodes, never expand a large requested rectangle into thousands
   // of synthetic empty cells. The process output cap bounds this read too.
   const data=await this.get(file,sheet.path,1,ctx,root);const cells=data.children.filter(node=>node.type==='row').flatMap(row=>row.children.filter(node=>node.type==='cell'));let rowCount=1,colCount=1;
   const values=new Map<string,CellValue>();
   for(const cell of cells){const address=/\/([A-Z]+)(\d+)$/.exec(cell.path);if(!address)continue;const c=[...address[1]].reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0),r=Number(address[2]);rowCount=Math.max(rowCount,r);colCount=Math.max(colCount,c);if(r>maxRows||c>maxCols||cell.format?.empty)continue;let value:CellValue=cell.text??null;if(cell.format?.formula)value='='+cell.format.formula;else if(cell.format?.type==='Boolean')value=cell.text==='TRUE';else if(cell.format?.type==='Number'&&cell.text&&Number.isFinite(Number(cell.text)))value=Number(cell.text);values.set(r+':'+c,value);}
   const rows=Array.from({length:Math.min(rowCount,maxRows)},(_,r)=>Array.from({length:Math.min(colCount,maxCols)},(_,c)=>values.get((r+1)+':'+(c+1))??null));
   sheets.push({name:sheet.preview??sheet.path.slice(1),rows,row_count:rowCount,column_count:colCount,truncated:rowCount>maxRows||colCount>maxCols});
  }return {sheets,truncated:selected.length>20||sheets.some(sheet=>sheet.truncated),formulas_recalculated:false,sheet_count:all.children.filter(sheet=>sheet.type==='sheet').length};
 }
 close(){this.stopped=true;this.setupAbort?.abort();for(const child of this.children)this.kill(child);}
}




