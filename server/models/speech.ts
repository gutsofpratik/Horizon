import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,readdir,mkdir,writeFile,rm,stat} from 'node:fs/promises';
import {join,resolve,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {AppContext} from '../app.ts';
import {EngineEnvironment} from './engines.ts';
import {registerOwnedProcess} from '../runtime/managed-process.ts';
import {workerExecutable} from './process.ts';
import {checkLoadingGuardrail,modelDefaults} from './defaults.ts';
import {connection,serviceRequest} from '../tools/ai-services.ts';
export const speechArchitectures=new Set(['whisper','wav2vec2','hubert','wavlm']);
export async function inspectSpeechModel(path:string){
 const config=JSON.parse(await readFile(join(path,'config.json'),'utf8'));
 if(!speechArchitectures.has(config.model_type)||config.auto_map)throw new Error('Choose a standard Whisper, Wav2Vec2, HuBERT, or WavLM speech model. Custom model code is not executed.');
 const files=await readdir(path);if(!files.some(file=>file.endsWith('.safetensors')))throw new Error('A speech model requires safetensors weights.');
 return {architecture:config.model_type,task:'speech'};
}
export class SpeechRuntime{
 readonly environment:EngineEnvironment;private child?:ChildProcessWithoutNullStreams;private pending=new Map<string,{resolve:(value:any)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();private busy=false;private closed=false;private stderr='';
 constructor(private context:AppContext){this.environment=new EngineEnvironment(context.root,context);}
 async prepare(){return this.environment.ensure('transformers','cpu');}
 private fail(error:Error){for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(error);}this.pending.clear();}
 async transcribe(entry:any,path:string,language?:string){
  if(this.busy)throw new Error('A transcription is already running. Wait for it to finish.');if(this.closed)throw new Error('Voice service is shutting down.');this.busy=true;
  try{await inspectSpeechModel(entry.path);await checkLoadingGuardrail(entry.path,modelDefaults(this.context.store.get('settings','main')?.modelDefaults??{}),{device:'cpu'});const python=await this.prepare();if(this.closed)throw new Error('Voice service is shutting down.');if(!this.child){const child=spawn(workerExecutable(python),['-u',join(this.context.root,'runtime/models/speech_worker.py')],{stdio:'pipe',windowsHide:true,detached:process.platform!=='win32',env:{...process.env,OPENCLAUDE_HOST_TOKEN:undefined,HF_HUB_OFFLINE:'1',HF_HUB_DISABLE_TELEMETRY:'1'}});this.child=child;registerOwnedProcess(this.context,child,'speech-worker',workerExecutable(python),process.platform!=='win32');child.stderr.on('data',chunk=>{this.stderr=(this.stderr+chunk.toString()).slice(-2000);});createInterface({input:child.stdout}).on('line',line=>{let result:any;try{result=JSON.parse(line);}catch{return;}const waiter=this.pending.get(result.id);if(!waiter)return;clearTimeout(waiter.timer);this.pending.delete(result.id);result.error?waiter.reject(new Error(result.error)):waiter.resolve(result.result);});child.on('error',error=>{if(this.child===child)this.fail(error);});child.on('exit',()=>{if(this.child===child){this.child=undefined;this.fail(new Error('Voice worker exited. '+this.stderr.slice(-600)));}});}
   const child=this.child;return await new Promise<any>((resolveResult,reject)=>{const id=randomUUID();const timer=setTimeout(()=>{this.pending.delete(id);if(this.child===child)this.child=undefined;child.kill();reject(new Error('Transcription timed out. Try a shorter recording or a smaller voice model.'));},300000);this.pending.set(id,{resolve:resolveResult,reject,timer});child.stdin.write(JSON.stringify({id,args:{modelPath:entry.path,audioPath:path,language}})+'\n',error=>{if(error){clearTimeout(timer);this.pending.delete(id);reject(error);}});});
  }finally{this.busy=false;}
 }
 snapshot(){return {status:this.environment.status,error:this.environment.error||null,recordingSupported:true,busy:this.busy,device:'cpu',architectures:[...speechArchitectures]};}
 close(){this.closed=true;this.fail(new Error('Voice service stopped.'));this.child?.kill();}
}
export function registerSpeechRoutes(app:any,context:AppContext){
 const runtime=new SpeechRuntime(context);context.ephemeral.set('speechRuntime',runtime);app.addHook('onClose',async()=>runtime.close());
 app.get('/api/voice/status',async()=>runtime.snapshot());
 app.post('/api/voice/prepare',async()=>{if(!context.ephemeral.has('modelRuntime'))throw new Error('Local voice models require the desktop host.');await runtime.prepare();return runtime.snapshot();});
 app.get('/api/voice/models',async()=>({models:context.store.list('local_models').filter(model=>model.task==='speech')}));
 app.post('/api/voice/import',async(request:any)=>{if(!context.ephemeral.has('modelRuntime'))throw new Error('Local model imports require the desktop host.');const input=z.object({path:z.string().min(1).max(2000)}).strict().parse(request.body);const path=resolve(input.path),detected=await inspectSpeechModel(path);const existing=context.store.list('local_models').find(model=>model.task==='speech'&&model.path===path);return existing??context.store.put('local_models',{id:randomUUID(),name:basename(path),path,...detected,configuration:{engine:'transformers',device:'cpu'}});});
 app.post('/api/voice/transcribe',async(request:any)=>{
  const file=await request.file({limits:{fileSize:10*1024*1024,files:1}});if(!file)throw new Error('Attach a recording.');const bytes=await file.toBuffer();if(file.file.truncated)throw new Error('Recordings must be under 10 MiB.');if(!/\.(wav|webm|mp3|ogg|m4a|flac)$/i.test(file.filename))throw new Error('Use a supported audio recording.');
  const settings:any=context.store.get('settings','main')??{},entry=settings.voiceModelId?context.store.get('local_models',settings.voiceModelId):null;
  if(settings.voiceModelId&&entry?.task!=='speech')throw new Error('Your selected voice model is unavailable. Choose another model in Voice settings.');
  if(entry?.task==='speech'){if(!context.ephemeral.has('modelRuntime'))throw new Error('Local speech requires the desktop host.');const folder=join(context.dataDirectory,'voice','temporary');await mkdir(folder,{recursive:true});const path=join(folder,randomUUID()+'.wav');await writeFile(path,bytes,{flag:'wx'});try{return await runtime.transcribe(entry,path,settings.voiceLanguage);}finally{await rm(path,{force:true});}}
  const service=connection({app:context} as any,'transcription'),form=new FormData();form.set('model',service.model);form.set('file',new Blob([new Uint8Array(bytes)],{type:file.mimetype}),file.filename);form.set('response_format','json');const result=await serviceRequest({app:context} as any,service,'/audio/transcriptions',form,true);if(typeof result.text!=='string')throw new Error('The voice provider returned no text.');return {text:result.text.slice(0,60000)};
 });
}
