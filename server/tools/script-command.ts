import {randomUUID} from 'node:crypto';import {mkdir,writeFile} from 'node:fs/promises';import {dirname,posix} from 'node:path';
import type {ToolContext} from './registry.ts';import {safePath,workspaceRoot} from './files.ts';import {nativeShellIsWindows} from '../runtime/native.ts';
const quote=(value:string,win:boolean)=>win?"'"+value.replaceAll("'","''")+"'":"'"+value.replaceAll("'","'\\''")+"'";
export async function scriptCommand(ctx:ToolContext,args:{language:'python'|'javascript'|'powershell'|'bash';source:string;cwd:string}){
 const win=nativeShellIsWindows(ctx),bytes=Buffer.from(args.source,'utf8'),encoded=bytes.toString('base64');
 if(bytes.length<=2400&&!(win&&args.language==='bash')){const source=quote(args.source,win),python="import base64;exec(compile(base64.b64decode('"+encoded+"'),'<horizon-script>','exec'))",javascript="eval(Buffer.from('"+encoded+"','base64').toString('utf8'))";
  return args.language==='python'?(win?'python':'python3')+' -c '+quote(python,win):args.language==='javascript'?'node -e '+quote(javascript,win):args.language==='powershell'?(win?args.source:'pwsh -NoProfile -Command '+source):(win?'bash -lc '+source:args.source);
 }
 // Keep long programs out of native command-line limits and preserve their UTF-8
 // source. Native dispatch binds this workspace; isolated workers receive bytes.
 const extension={python:'py',javascript:'cjs',powershell:'ps1',bash:'sh'}[args.language];const path='.skills/.horizon-scripts/'+randomUUID()+'.'+extension;
 const relative=posix.join(args.cwd.replaceAll('\\','/'),path);const target=await safePath(workspaceRoot(ctx),relative);
 const content=args.language==='powershell'&&win?Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),bytes]):bytes;
 if(ctx.executionEnvironmentId)await ctx.app.runtime!.request('workspace_write',{path:relative,content:content.toString('base64'),overwrite:false},ctx);
 else{await mkdir(dirname(target),{recursive:true});await writeFile(target,content,{flag:'wx'});}
 if(args.language==='javascript')return 'node -e '+quote("(()=>{const fs=require('node:fs'),s=fs.readFileSync('"+path+"','utf8');fs.unlinkSync('"+path+"');eval(s)})()",win);
 if(args.language==='python')return (win?'python':'python3')+' -c '+quote("from pathlib import Path;p=Path('"+path+"');s=p.read_bytes();p.unlink();exec(compile(s,'<horizon-script>','exec'))",win);
 const quoted=quote(path,win);
 return win?(args.language==='powershell'?'try { & '+quoted+' } finally { Remove-Item -LiteralPath '+quoted+' -Force }':'try { & bash '+quoted+' } finally { Remove-Item -LiteralPath '+quoted+' -Force }'):'trap '+quote('rm -f -- '+quote(path,false),false)+' EXIT; '+(args.language==='powershell'?'pwsh -NoProfile -File ':'bash ')+quoted;
}
