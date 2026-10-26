import {inspectSpeechModel} from './speech.ts';
import {mkdir,stat,rename,rm,open} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {join,dirname,basename} from 'node:path';
import type {AppContext} from '../app.ts';

export function registerModelDownloads(app:any,context:AppContext){
 const controllers=new Map<string,AbortController>(),running=new Map<string,Promise<void>>();
 const publicJob=(job:any)=>{const {directory,configuration,files,projector,...visible}=job;return visible;};
 const write=(job:any)=>context.store.put('model_downloads',job);
 for(const job of context.store.list('model_downloads'))if(job.status==='downloading')write({...job,status:'paused',error:'Download paused when Horizon stopped. Resume to continue.'});
 const execute=async(job:any)=>{
  const controller=new AbortController();controllers.set(job.id,controller);job.status='downloading';job.error='';write(job);
  try{
   const metadata=await fetch(`https://huggingface.co/api/models/${job.repo}/revision/${job.revision}?blobs=true`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])});
   if(!metadata.ok)throw new Error(`Publisher metadata returned HTTP ${metadata.status}`);
   const source=await metadata.json();const indexed=new Map<string,any>((source.siblings??[]).map((file:any)=>[file.rfilename,file]));
   for(const name of job.files)if(!indexed.has(name))throw new Error('Publisher does not contain selected file: '+name);
   const total=job.files.reduce((sum:number,name:string)=>sum+(indexed.get(name)?.size??indexed.get(name)?.lfs?.size??0),0);let completedBytes=0;
   await mkdir(job.directory,{recursive:true});
   for(let index=0;index<job.files.length;index++){
    controller.signal.throwIfAborted();const file=job.files[index],info=indexed.get(file),expected=info.size??info.lfs?.size,hash=info.lfs?.sha256??info.lfs?.oid;
    const target=join(job.directory,file),partial=target+'.horizon-part';await mkdir(dirname(target),{recursive:true});
    const finished=await stat(target).catch(()=>null);if(finished&&expected&&finished.size===expected){completedBytes+=finished.size;continue;}
    let offset=(await stat(partial).catch(()=>null))?.size??0;
    if(expected&&offset>expected){await rm(partial,{force:true});offset=0;}
    let received=offset,last=0;
    // A pause/crash can occur after the final byte but before checksum/publish.
    // Verify that complete partial locally instead of requesting an invalid range.
    if(!expected||offset!==expected){
    const response=await fetch(`https://huggingface.co/${job.repo}/resolve/${job.revision}/${file.split('/').map(encodeURIComponent).join('/')}`,{headers:offset?{Range:`bytes=${offset}-`}:{},signal:controller.signal});
    if(!response.ok||!response.body)throw new Error(`Download ${file} returned HTTP ${response.status}`);
    if(offset&&response.status!==206)offset=0;
    if(offset&&!(response.headers.get('content-range')??'').startsWith(`bytes ${offset}-`))throw new Error('Publisher returned an unexpected resume range');
    received=offset;const handle=await open(partial,offset?'a':'w');
    try{for await(const chunk of response.body as any){controller.signal.throwIfAborted();await handle.writeFile(chunk);received+=chunk.length;if(Date.now()-last>350){last=Date.now();job.progress={file,completedFiles:index,totalFiles:job.files.length,bytes:completedBytes+received,totalBytes:total,fileBytes:received,fileTotalBytes:expected??null};write(job);}}}finally{await handle.close();}
    }
    if(expected&&received!==expected)throw new Error('Incomplete download: '+file);
    if(hash&&/^[a-f0-9]{64}$/.test(hash)){const checksum=createHash('sha256');for await(const chunk of createReadStream(partial))checksum.update(chunk);if(checksum.digest('hex')!==hash){await rm(partial,{force:true});throw new Error('Publisher checksum did not match: '+file);}}
    controller.signal.throwIfAborted();await rename(partial,target);completedBytes+=received;
    job.progress={file,completedFiles:index+1,totalFiles:job.files.length,bytes:completedBytes,totalBytes:total};write(job);
   }
   const gguf=job.files.find((file:string)=>file.endsWith('.gguf')&&file!==job.projector);
   if(job.task==='speech')await inspectSpeechModel(job.directory);
   const entry=context.store.put('local_models',{id:randomUUID(),task:job.task??'chat',name:job.repo+(gguf?' · '+basename(gguf):''),path:gguf?join(job.directory,gguf):job.directory,configuration:{...job.configuration,...(job.projector?{visionProjectorPath:join(job.directory,job.projector)}:{})},source:{repo:job.repo,revision:job.revision}});
   job.status='completed';job.model={id:entry.id,name:entry.name};write(job);
  }catch(error){if(job.status==='downloading'){job.status=controller.signal.aborted?'paused':'failed';job.error=(error as Error).message;write(job);}}finally{controllers.delete(job.id);running.delete(job.id);}
 };
 const launch=(job:any)=>{const promise=execute(job);running.set(job.id,promise);};
 app.get('/api/model-library/downloads',async()=>({downloads:context.store.list('model_downloads').map(publicJob).reverse()}));
 app.get('/api/model-library/downloads/:id',async(request:any)=>{const job=context.store.get('model_downloads',request.params.id);if(!job)throw new Error('Download not found');return publicJob(job);});
 app.post('/api/model-library/download',async(request:any)=>{
  const {repo,revision,files,configuration,projector,task}=request.body??{};if(task!==undefined&&!['chat','speech'].includes(task))throw new Error('Unknown model task');
  if(typeof repo!=='string'||!/^[\w.-]+\/[\w.-]+$/.test(repo)||typeof revision!=='string'||!/^[a-f0-9]{40}$/.test(revision)||!Array.isArray(files)||!files.length||files.length>1000)throw new Error('Select files from a pinned source repository');
  if(files.some((file:any)=>typeof file!=='string'||file.length>500||file.includes('\\')||file.startsWith('/')||file.split('/').some(part=>!part||part==='.'||part==='..')||file.includes(':')||!/[.](json|safetensors|gguf|model|txt|tiktoken|jinja)$/i.test(file)))throw new Error('Unsupported model resource path');
  if(projector&&(!files.includes(projector)||!projector.endsWith('.gguf')))throw new Error('Select a projector included in this download');
  if(controllers.size>=2)throw new Error('Two downloads are already active. Pause one before starting another.');
  const duplicate=context.store.list('model_downloads').find(job=>job.repo===repo&&job.revision===revision&&['downloading','paused'].includes(job.status)&&JSON.stringify(job.files)===JSON.stringify([...new Set(files)]));if(duplicate)return publicJob(duplicate);
  const id=randomUUID();const job:any={id,repo,revision,task:task??'chat',files:[...new Set(files)],configuration:configuration??{},projector,directory:join(context.dataDirectory,'models','downloads',id),status:'downloading',createdAt:new Date().toISOString(),progress:null};write(job);launch(job);return publicJob(job);
 });
 app.post('/api/model-library/downloads/:id/:action',async(request:any)=>{
  const job=context.store.get('model_downloads',request.params.id);if(!job)throw new Error('Download not found');const action=request.params.action;
  if(action==='resume'){if(running.has(job.id))throw new Error('Download is still stopping');if(!['paused','failed'].includes(job.status))throw new Error('This download cannot be resumed');if(controllers.size>=2)throw new Error('Two downloads are already active');launch(job);}
  else if(action==='pause'||action==='cancel'){if(job.status==='completed')throw new Error('Completed models are managed from Models');const current=running.get(job.id);const active=controllers.get(job.id);active?.abort();if(current)await current;const fresh=context.store.get('model_downloads',job.id)!;if(fresh.status==='completed')return publicJob(fresh);fresh.status=action==='pause'?'paused':'cancelled';fresh.error='';write(fresh);if(action==='cancel')await rm(fresh.directory,{recursive:true,force:true});}
  else throw new Error('Choose pause, resume or cancel');return publicJob(context.store.get('model_downloads',job.id));
 });
 app.addHook('onClose',async()=>{for(const controller of controllers.values())controller.abort();await Promise.allSettled([...running.values()]);});
}
