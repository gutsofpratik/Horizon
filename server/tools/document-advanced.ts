import {z} from 'zod';
import {ToolError,type ToolRegistry} from './registry.ts';
import {executeGroupedLeaf} from './groups.ts';
import {readFile,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {delimiter,join,relative} from 'node:path';
import {fileInContext,safePath,workspaceRoot} from './files.ts';
const hasOcr=()=>(process.env.PATH??process.env.Path??'').split(delimiter).some(directory=>existsSync(join(directory,process.platform==='win32'?'tesseract.exe':'tesseract')));
export function registerDocumentAdvancedTools(registry:ToolRegistry){
 const local=(name:string,description:string,input:z.ZodType)=>registry.register({name,description,input,capability:'document-job',requires:'Local PDF/image runtime; OCR additionally requires Tesseract and its language data',available:()=>name==='document_ocr'&&!hasOcr()?'Install Tesseract and its language data on the server PATH to use OCR':null,handler:async(args,ctx)=>{const runtime=ctx.app.ephemeral.get('documentRuntime');if(!runtime)throw new ToolError('DOCUMENT_RUNTIME_UNAVAILABLE','The local document service is not configured');const result=await runtime.request(name,args,ctx);if(name==='image_open'&&ctx.vision&&result.files?.[0]){const file=fileInContext(ctx,result.files[0].id),path=await safePath(workspaceRoot(ctx),relative(workspaceRoot(ctx),file.absolutePath));if((await stat(path)).size<=8*1024*1024)return {...result,screenshot:{image:(await readFile(path)).toString('base64'),source_file_id:args.file_id,kind:'file-preview'}};}return result;}});
 local('image_metadata','Inspect image dimensions, format, mode and frame count without sending it to a model or exposing EXIF location data.',z.object({file_id:z.string()}).strict());
 local('image_open','Create a bounded PNG preview of a registered workspace image. Return its real downloadable preview; this does not grant a text-only model vision.',z.object({file_id:z.string()}).strict());
 local('document_ocr','Extract text from up to ten PDF pages or one image using installed Tesseract OCR. Specify a language whose trained data is installed. Does not edit the source.',z.object({file_id:z.string(),language:z.string().regex(/^[A-Za-z][A-Za-z0-9_+]{0,49}$/).default('eng'),start_page:z.number().int().min(1).max(10000).default(1),max_pages:z.number().int().min(1).max(10).default(3)}).strict());
 registry.register({name:'document_to_markdown',capability:'document-job',description:'Extract a registered PDF, Office document or text file as bounded plain Markdown text. Keeps page/paragraph breaks; complex Office layout is not reconstructed.',input:z.object({file_id:z.string()}).strict(),handler:async(args,ctx)=>{const result=await executeGroupedLeaf(registry,'document_extract',args,ctx);return {file_id:args.file_id,markdown:String(result.text??''),truncated:!!result.truncated,conversion:'text-extraction',source_preserved:true};}});
}
