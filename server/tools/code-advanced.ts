import {z} from 'zod';
import {parse} from '@babel/parser';
import {createReadStream} from 'node:fs';
import {readFile,readdir,stat} from 'node:fs/promises';
import {join,relative,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {ToolError,type ToolRegistry,type ToolContext} from './registry.ts';
import {safePath,workspaceRoot} from './files.ts';
import {executeGroupedLeaf} from './groups.ts';
import {nativeShellIsWindows} from '../runtime/native.ts';

const path=z.string().min(1).max(500).default('.');
const ignored=new Set(['node_modules','.git','.skills','dist','build','coverage','.next','.venv','vendor']);
async function sourceFiles(ctx:ToolContext,input:string){
 const root=workspaceRoot(ctx),start=await safePath(root,input),files:{path:string;text:string}[]=[];
 let entries=0,bytes=0,truncated=false;
 async function visit(file:string,depth:number):Promise<void>{
  if(ctx.signal.aborted)throw new ToolError('CANCELLED','Search cancelled');
  if(entries++>=3000||files.length>=300||bytes>=10_000_000||depth>12){truncated=true;return;}
  await safePath(root,relative(root,file));const info=await stat(file);
  if(info.isDirectory()){for(const entry of await readdir(file,{withFileTypes:true})){if(ignored.has(entry.name)||entry.isSymbolicLink())continue;await visit(join(file,entry.name),depth+1);if(entries>=3000||files.length>=300||bytes>=10_000_000)break;}}
  else if(info.isFile()){
   if(info.size>1_000_000||bytes+info.size>10_000_000){truncated=true;return;}
   const text=await readFile(file,'utf8');bytes+=info.size;if(!text.includes('\0'))files.push({path:relative(root,file).replaceAll('\\','/'),text});
  }
 }
 await visit(start,0);return {files,truncated,bytes};
}
export function registerCodeAdvancedTools(registry:ToolRegistry){
 registry.register({name:'code_search',capability:'workspace-file',description:'Search literal text recursively in workspace source files with line numbers. Skips dependency/build folders and symlinks; scans at most 300 files/10 MB and returns at most 100 matches.',input:z.object({path,query:z.string().min(1).max(1000),case_sensitive:z.boolean().default(false),max_results:z.number().int().min(1).max(100).default(50)}).strict(),handler:async(a,c)=>{const scanned=await sourceFiles(c,a.path),results:any[]=[];let total=0;for(const file of scanned.files)for(const [index,line] of file.text.split('\n').entries())if((a.case_sensitive?line:line.toLowerCase()).includes(a.case_sensitive?a.query:a.query.toLowerCase())){total++;if(results.length<a.max_results)results.push({path:file.path,line:index+1,text:line.slice(0,1000)});}return {results,files_scanned:scanned.files.length,truncated:scanned.truncated||total>results.length};}});
 registry.register({name:'symbol_search',capability:'workspace-file',description:'Find JavaScript/TypeScript declarations using the Babel syntax tree: functions, classes, interfaces, types, enums, methods and variables. Other languages are reported unsupported; this is syntax lookup, not cross-project reference resolution.',input:z.object({path,query:z.string().max(200).default(''),max_results:z.number().int().min(1).max(100).default(50)}).strict(),handler:async(a,c)=>{
  const scanned=await sourceFiles(c,a.path),results:any[]=[],parse_errors:any[]=[],unsupported=new Set<string>();let total=0,parsed=0;
  const declarations=new Set(['FunctionDeclaration','ClassDeclaration','TSInterfaceDeclaration','TSTypeAliasDeclaration','TSEnumDeclaration','ClassMethod','ClassPrivateMethod','ObjectMethod','VariableDeclarator']);
  for(const file of scanned.files){
   c.signal.throwIfAborted();
   if(!/\.[cm]?[jt]sx?$/i.test(file.path)){unsupported.add(extname(file.path)||'(no extension)');continue;}
   let ast:any;
   try{ast=parse(file.text,{sourceType:'unambiguous',sourceFilename:file.path,plugins:[...(/\.[cm]?tsx?$/i.test(file.path)?['typescript' as const]:[]),...(/\.[jt]sx$/i.test(file.path)?['jsx' as const]:[])],errorRecovery:true,attachComment:false});}
   catch(error){parse_errors.push({path:file.path,error:(error as Error).message.slice(0,300)});continue;}
   parsed++;
   for(const error of ast.errors??[])if(parse_errors.length<30)parse_errors.push({path:file.path,error:String(error.message).slice(0,300)});
   const stack:any[]=[ast.program];
   while(stack.length){
    const node=stack.pop();if(!node||typeof node!=='object')continue;
    if(declarations.has(node.type)){
     const identifier=node.id??node.key;const name=identifier?.name??identifier?.id?.name??(typeof identifier?.value==='string'?identifier.value:undefined);
     if(name&&name.toLowerCase().includes(a.query.toLowerCase())){total++;if(results.length<a.max_results)results.push({name,kind:node.type,path:file.path,line:node.loc?.start.line??1,column:(node.loc?.start.column??0)+1});}
    }
    for(const [key,value] of Object.entries(node)){if(['loc','start','end','extra','comments','leadingComments','trailingComments','innerComments'].includes(key))continue;if(Array.isArray(value)){for(let i=value.length-1;i>=0;i--)if(value[i]&&typeof value[i].type==='string')stack.push(value[i]);}else if(value&&typeof value==='object'&&'type' in value)stack.push(value);}
   }
   await new Promise<void>(resolve=>setImmediate(resolve));
  }
  return {results,files_parsed:parsed,parse_errors,unsupported_extensions:[...unsupported],truncated:scanned.truncated||total>results.length};
 }});
 for(const action of ['lint','format','test'] as const)registry.register({name:'code_'+action,capability:'terminal',available:()=>registry.tools.get('terminal_run')?.available?.()??null,description:`Run the project's existing npm ${action} script (or a named existing npm script) in the granted terminal. Returns the actual terminal job/output; use shell.read to confirm exit status. Does not install packages or claim success before completion.`,input:z.object({cwd:path,script:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$/).default(action),timeout_ms:z.number().int().min(1000).max(300000).default(60000)}).strict(),handler:(a,c)=>{const win=nativeShellIsWindows(c);return executeGroupedLeaf(registry,'terminal_run',{command:(win?'npm.cmd':'npm')+' run '+a.script,cwd:a.cwd,timeout_ms:a.timeout_ms,interactive:false},c);}});
 registry.register({name:'files_hash',capability:'workspace-file',description:'Stream a workspace file to calculate its SHA-256 or SHA-512 hash. Files must be regular files under 256 MB; reports bytes hashed and rejects files changed during reading.',input:z.object({path:z.string().min(1).max(500),algorithm:z.enum(['sha256','sha512']).default('sha256')}).strict(),handler:async(a,c)=>{const file=await safePath(workspaceRoot(c),a.path),before=await stat(file);if(!before.isFile()||before.size>256*1024*1024)throw new ToolError('FILE_TOO_LARGE','Hash a regular file under 256 MB');const hash=createHash(a.algorithm),stream=createReadStream(file,{signal:c.signal});let bytes=0;for await(const chunk of stream){bytes+=chunk.length;if(bytes>256*1024*1024){stream.destroy();throw new ToolError('FILE_TOO_LARGE','File grew beyond 256 MB');}hash.update(chunk);}const after=await stat(file);if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ino!==after.ino)throw new ToolError('FILE_CONFLICT','File changed during hashing; retry');return {path:a.path,algorithm:a.algorithm,hash:hash.digest('hex'),bytes};}});
}
