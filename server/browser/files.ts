import {z} from 'zod';
import {readFile,mkdir,writeFile,stat} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {ToolRegistry,ToolError} from '../tools/registry.ts';
import {fileInContext,safePath,workspaceRoot,registerFile,projectKey} from '../tools/files.ts';
import {artifactById,canAccessArtifact} from '../artifacts/access.ts';
import {nativeAvailable,nativeRequest} from '../runtime/native.ts';

export function registerBrowserFileTools(registry:ToolRegistry){
 registry.register({name:'browser_open_file',capability:'browser',description:'OPEN an existing file/artifact, not scroll or inspect an already-open page. Provide exactly one object: {"path":"index.html"}, {"file_id":"returned-file-id"}, or {"artifact_id":"saved-artifact-id"}. Never {}. For scrolling use browser_scroll; for inspection use browser_snapshot; for slide navigation use browser_click or browser_press. HTML opens in an inspectable embedded tab; other files use the internal viewer.',requires:'An existing file in this conversation/project workspace or saved artifact; use the actual ID from conversation context.',input:z.union([z.object({path:z.string().min(1).max(500)}).strict(),z.object({file_id:z.string().min(1)}).strict(),z.object({artifact_id:z.string().min(1)}).strict()]),handler:async(args,ctx)=>{
  if([args.path,args.file_id,args.artifact_id].filter(value=>value!==undefined).length!==1)throw new ToolError('INVALID_ARGUMENTS','Provide exactly one of path, file_id, or artifact_id');
  if(ctx.incognito)throw new ToolError('PRIVATE_FILES_UNAVAILABLE','Persistent workspace file previews are unavailable in incognito. Use the private artifact preview instead.');
  let file:any;
  if(args.artifact_id){const artifact=artifactById(args.artifact_id,ctx);if(!artifact||!canAccessArtifact(artifact,ctx))throw new ToolError('ARTIFACT_NOT_FOUND','Artifact is not in this conversation');if(!['html','svg'].includes(artifact.type)&&!(artifact.type==='code'&&['html','svg'].includes(artifact.language)))throw new ToolError('UNSUPPORTED_PREVIEW','This artifact is not HTML or SVG. Use artifact_read to inspect its source.');const directory=await safePath(workspaceRoot(ctx),'previews');await mkdir(directory,{recursive:true});const target=join(directory,encodeURIComponent(artifact.id)+'.'+(artifact.type==='svg'?'svg':'html'));await writeFile(target,artifact.source);file=await registerFile(ctx.app,target,projectKey(ctx),'text/html');}
  else if(args.file_id)file=fileInContext(ctx,args.file_id);
  else{const target=await safePath(workspaceRoot(ctx),args.path);if(!(await stat(target)).isFile())throw new ToolError('FILE_NOT_FOUND','Choose an existing file, not a directory');file=await registerFile(ctx.app,target,projectKey(ctx),['.html','.htm'].includes(extname(target).toLowerCase())?'text/html':'application/octet-stream');}
  const stored=ctx.app.store.get('files',file.id)!;const html=/\.(html?|svg)$/i.test(file.name)||stored.mediaType==='text/html';
  if(!html){const url='/api/files/'+file.id;ctx.emit('browser.open_requested',{url,preview:true});return {file_id:file.id,url,viewer:'internal-file-preview',summary:'Opened '+file.name+' in the in-app file preview. Browser DOM tools apply to HTML tabs, not this file viewer.'};}
  if(stored.size>5*1024*1024)throw new ToolError('FILE_TOO_LARGE','HTML browser previews are limited to 5 MiB');
  let result:any,url:string;
  if(ctx.edition==='desktop'&&nativeAvailable(ctx.app,'browser_open')){url='http://127.0.0.1:'+String(process.env.PORT??3001)+'/api/files/'+file.id+'/preview';result=await nativeRequest(ctx.app,'browser_open',{url},ctx);}
  else{const browser=ctx.app.ephemeral.get('webBrowser');if(!browser)throw new ToolError('RUNTIME_UNAVAILABLE','The built-in browser is unavailable');result=await browser.openDocument(ctx.conversationId,await readFile(stored.absolutePath,'utf8'),file.name);url=result.snapshot.url;}
  ctx.emit('browser.open_requested',{url,alreadyOpen:true,preview:false});
  return {...result,file_id:file.id,url,summary:'Opened '+file.name+' in the embedded browser. Use the returned observation for DOM interaction; local previews have no network access.'};
 }});
}
