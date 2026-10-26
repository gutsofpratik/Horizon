import {ensureDefaultSpeech} from '../models/default-speech.ts';
import {z} from 'zod';
import {readFile,stat} from 'node:fs/promises';
import {relative} from 'node:path';
import {ToolError,type ToolRegistry} from './registry.ts';
import {connection,serviceRequest} from './ai-services.ts';
import {fileInContext,safePath,workspaceRoot} from './files.ts';
export function registerTranscriptionTool(registry:ToolRegistry){
 registry.register({name:'audio_transcribe',capability:'document-job',requires:'A local speech model or transcription provider configured in Settings → Models → Voice',description:'Transcribe a registered audio file with the selected speech-to-text model. Local recognition uses the separate CPU speech worker and accepts 16-bit PCM WAV, up to two minutes. Other supported audio/video formats can use an explicitly configured transcription provider (max 25 MiB). No silent provider fallback.',input:z.object({file_id:z.string(),language:z.string().regex(/^[a-z]{2}$/).optional()}).strict(),handler:async(args,ctx)=>{
  const file=fileInContext(ctx,args.file_id),path=await safePath(workspaceRoot(ctx),relative(workspaceRoot(ctx),file.absolutePath));
  if(!/\.(mp3|mp4|mpeg|mpga|m4a|wav|webm|ogg|flac)$/i.test(file.name)||(await stat(path)).size>25*1024*1024)throw new ToolError('AUDIO_INPUT_LIMIT','Use a supported audio file under 25 MiB');
  const settings:any=ctx.app.store.get('settings','main')??{};
  if(settings.voiceMode!=='provider'&&ctx.app.ephemeral.has('modelRuntime')){const entry=await ensureDefaultSpeech(ctx.app);const runtime=ctx.app.ephemeral.get('speechRuntime');if(entry?.task!=='speech'||!runtime||!ctx.app.ephemeral.has('modelRuntime'))throw new ToolError('VOICE_MODEL_UNAVAILABLE','Select an available local speech model in Settings → Models → Voice.');const result=await runtime.transcribe(entry,path,args.language);return {file_id:file.id,...result,provider:'Horizon local speech',model:entry.name};}
  const service=connection(ctx,'transcription'),form=new FormData();form.set('model',service.model);form.set('file',new Blob([new Uint8Array(await readFile(path))],{type:file.mediaType??'application/octet-stream'}),file.name);if(args.language)form.set('language',args.language);form.set('response_format','json');const result=await serviceRequest(ctx,service,'/audio/transcriptions',form,true);if(typeof result.text!=='string')throw new ToolError('INVALID_TRANSCRIPTION','The selected provider returned no transcription text');return {file_id:file.id,text:result.text.slice(0,60000),truncated:result.text.length>60000,provider:service.provider.name,model:service.model};
 }});
}
