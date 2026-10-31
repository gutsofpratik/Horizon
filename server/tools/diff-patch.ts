import {z} from 'zod';
import {readFile,writeFile,mkdir,rename,unlink,stat} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ToolError,type ToolRegistry} from './registry.ts';
import {safePath,workspaceRoot,digest,registerFile,projectKey} from './files.ts';

/** Strict unified hunks: no fuzzy matching, shell execution, or implicit path changes. */
export function applyUnifiedDiff(original:string,diff:string){
 const newline=original.includes('\r\n')?'\r\n':'\n';const source=original.replaceAll('\r\n','\n').split('\n');if(source.at(-1)==='')source.pop();
 const lines=diff.replaceAll('\r\n','\n').split('\n');if(lines.at(-1)==='')lines.pop();let cursor=0,index=0;const output:string[]=[];let hunks=0;let finalNewline=original.endsWith('\n');
 while(index<lines.length&&/^(?:--- |\+\+\+ )/.test(lines[index]))index++;
 while(index<lines.length){const header=/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/.exec(lines[index++]);if(!header)throw new ToolError('INVALID_PATCH','Expected a unified diff hunk header');hunks++;const oldCount=Number(header[2]??1),newCount=Number(header[4]??1),start=Number(header[1])-(oldCount?1:0),newStart=Number(header[3])-(newCount?1:0);if(start<cursor||start>source.length)throw new ToolError('INVALID_PATCH','Overlapping or out-of-range hunk');output.push(...source.slice(cursor,start));cursor=start;if(newStart!==output.length)throw new ToolError('INVALID_PATCH','New-file hunk position is inconsistent');let consumed=0,produced=0,lastMarker='',newSideNewline=true;
  while(index<lines.length&&!lines[index].startsWith('@@ ')){const line=lines[index++];if(line==='\\ No newline at end of file'){if(!lastMarker)throw new ToolError('INVALID_PATCH','Newline marker must follow a hunk line');if(lastMarker==='+'||lastMarker===' ')newSideNewline=false;continue;}const marker=line[0],text=line.slice(1);if(marker===' '||marker==='-'){if(source[cursor]!==text)throw new ToolError('PATCH_NO_MATCH','Hunk does not match current file at line '+(cursor+1));cursor++;consumed++;}if(marker===' '||marker==='+'){output.push(text);produced++;newSideNewline=true;}else if(marker!=='-')throw new ToolError('INVALID_PATCH','Hunk lines must start with space, + or -');lastMarker=marker;}
  if(cursor===source.length)finalNewline=newSideNewline;
  if(consumed!==oldCount||produced!==newCount)throw new ToolError('INVALID_PATCH','Hunk line counts do not match its header');
 }
 if(!hunks)throw new ToolError('INVALID_PATCH','At least one hunk is required');output.push(...source.slice(cursor));return output.join(newline)+(finalNewline&&output.length?newline:'');
}
const path=z.string().min(1).max(500).refine(value=>value!=='.','A file path is required');
const operation=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('create_file'),path,text:z.string().max(500000)}).strict(),
 z.object({operation:z.literal('update_file'),path,expected_hash:z.string().regex(/^[a-f0-9]{64}$/),diff:z.string().min(1).max(500000)}).strict(),
 z.object({operation:z.literal('delete_file'),path,expected_hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict()
]);
export function registerDiffPatchTool(registry:ToolRegistry){registry.register({name:'files_apply_patch',capability:'workspace-file',description:'Apply a bounded transaction of create_file/update_file/delete_file operations. Read existing files for expected_hash. Updates use exact unified diff hunks, no fuzzy matching. Prevalidates the complete batch and restores originals if a write fails.',input:z.object({operations:z.array(operation).min(1).max(30)}).strict(),handler:async(args,ctx)=>{
 const key='patch-lock:'+projectKey(ctx);if(ctx.app.ephemeral.get(key))throw new ToolError('WORKSPACE_BUSY','Another patch is in progress');ctx.app.ephemeral.set(key,true);
 const prepared:{path:string;absolute:string;before:Buffer|null;after:string|null;temp?:string}[]=[];const applied:typeof prepared=[];
 try{const seen=new Set<string>();for(const op of args.operations){const absolute=await safePath(workspaceRoot(ctx),op.path),key=process.platform==='win32'?absolute.toLowerCase():absolute;if(seen.has(key))throw new ToolError('INVALID_PATCH','Only one operation per path is allowed');seen.add(key);let before:Buffer|null=null;try{if(!(await stat(absolute)).isFile())throw new ToolError('INVALID_PATCH','Patch target must be a regular file');before=await readFile(absolute);}catch(error:any){if(error.code!=='ENOENT')throw error;}
  if(before&&before.length>1000000)throw new ToolError('FILE_TOO_LARGE','Patch targets must be at most 1 MB');if(op.operation==='create_file'&&before!==null)throw new ToolError('FILE_CONFLICT','Create target already exists');if(op.operation!=='create_file'&&(before===null||digest(before)!==op.expected_hash))throw new ToolError('FILE_CONFLICT','Read the current file before patching');if(before?.includes(0))throw new ToolError('INVALID_PATCH','Binary patching is unsupported');const after=op.operation==='delete_file'?null:op.operation==='create_file'?op.text:applyUnifiedDiff(before!.toString('utf8'),op.diff);prepared.push({path:op.path,absolute,before,after});}
  for(const item of prepared){if(ctx.signal.aborted)throw new ToolError('CANCELLED','Patch cancelled');if(item.after!==null){await mkdir(dirname(item.absolute),{recursive:true});item.temp=item.absolute+'.'+randomUUID()+'.patch';await writeFile(item.temp,item.after);}}
  for(const item of prepared){await safePath(workspaceRoot(ctx),item.path);let current:Buffer|null=null;try{current=await readFile(item.absolute);}catch(error:any){if(error.code!=='ENOENT')throw error;}if((current===null)!==(item.before===null)||current&&digest(current)!==digest(item.before!))throw new ToolError('FILE_CONFLICT','File changed while preparing the patch');if(item.after===null)await unlink(item.absolute);else await rename(item.temp!,item.absolute);applied.push(item);}
 }catch(error){const failures:string[]=[];for(const item of applied.reverse())try{if(item.before===null)await unlink(item.absolute);else await writeFile(item.absolute,item.before);}catch{failures.push(item.path);}if(failures.length)throw new ToolError('PATCH_ROLLBACK_FAILED','Patch failed and some originals could not be restored',{paths:failures});throw error;
 }finally{for(const item of prepared)if(item.temp)await unlink(item.temp).catch(()=>{});ctx.app.ephemeral.delete(key);}
 const files=[];for(const item of prepared)if(item.after!==null)files.push(await registerFile(ctx.app,item.absolute,projectKey(ctx),'text/plain'));else for(const file of ctx.app.store.list('files').filter(file=>file.absolutePath===item.absolute))ctx.app.store.delete('files',file.id);return {changes:prepared.map(item=>({path:item.path,operation:item.after===null?'deleted':item.before===null?'created':'updated',hash:item.after===null?null:digest(item.after)})),files};
 }});}
