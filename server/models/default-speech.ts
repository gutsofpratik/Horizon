import {setTimeout as delay} from 'node:timers/promises';
import type {AppContext} from '../app.ts';
import {modelDownloadPlan} from './download-plan.ts';
export async function ensureDefaultSpeech(context:AppContext):Promise<any>{
 const settings:any=context.store.get('settings','main')??{};
 if(settings.voiceModelId){const selected=context.store.get('local_models',settings.voiceModelId);if(selected?.task==='speech')return selected;throw new Error('The selected speech model was removed. Choose the default or another voice model.');}
 const active=context.ephemeral.get('defaultSpeechSetup');if(active)return active;
 const operation=(async()=>{
  const existing=context.store.list('local_models').find(model=>model.task==='speech'&&model.source?.repo==='openai/whisper-tiny');
  let model=existing;
  if(!model){
   const start=context.ephemeral.get('startModelDownload');if(!start)throw new Error('Local speech recognition requires Horizon Desktop.');
   const response=await fetch('https://huggingface.co/api/models/openai/whisper-tiny?blobs=true',{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('Could not retrieve the default Whisper model: HTTP '+response.status);const source=await response.json();
   const files=(source.siblings??[]).map((file:any)=>({name:file.rfilename}));const plan=await modelDownloadPlan(files,async()=>{throw new Error('The default voice model must use unsharded weights.');});if(!plan.safetensorsFiles.length)throw new Error('The default Whisper source contains no supported safetensors weights.');
   const job=await start({repo:'openai/whisper-tiny',revision:source.sha,files:plan.safetensorsFiles,task:'speech',configuration:{engine:'transformers',device:'cpu'}});context.ephemeral.set('defaultSpeechJobId',job.id);if(job.status==='paused')context.ephemeral.get('resumeModelDownload')?.(job.id);
   const until=Date.now()+300000;
   while(Date.now()<until){const current=context.store.get('model_downloads',job.id);if(current?.status==='completed'){model=context.store.get('local_models',current.model.id);break;}if(['failed','cancelled','paused'].includes(current?.status))throw new Error(current?.error||'Default voice setup was interrupted. Retry from Voice settings.');await delay(350);}
   if(!model)throw new Error('Default voice download timed out. Resume it from the model library.');
  }
  const latest:any=context.store.get('settings','main')??{id:'main'};if(!latest.voiceModelId&&latest.voiceMode!=='provider')context.store.put('settings',{...latest,voiceModelId:model.id,voiceMode:'local'});
  return model;
 })();
 context.ephemeral.set('defaultSpeechSetup',operation);
 try{return await operation;}finally{if(context.ephemeral.get('defaultSpeechSetup')===operation)context.ephemeral.delete('defaultSpeechSetup');}
}
