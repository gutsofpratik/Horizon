import {homedir} from 'node:os';import {join,relative,resolve} from 'node:path';
import {readdir,readFile,stat,mkdir,link,copyFile,writeFile,open,rename,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';import type {AppContext} from '../app.ts';
const defaultRoot=()=>resolve(process.env.OLLAMA_MODELS??join(homedir(),'.ollama','models'));
const digestFile=(root:string,digest:string)=>{if(!/^sha256:[a-f0-9]{64}$/.test(digest))throw new Error('Invalid Ollama blob digest');return join(root,'blobs',digest.replace(':','-'));};
async function jsonFile(path:string){if((await stat(path)).size>2*1024*1024)throw new Error('Ollama metadata exceeds the supported size');return JSON.parse(await readFile(path,'utf8'));}
async function preserveBlob(source:string,destination:string,size:number){
 try{if((await stat(destination)).size===size)return;}catch(error){if((error as any).code!=='ENOENT')throw error;}
 const temporary=destination+'.'+randomUUID()+'.tmp';
 try{try{await link(source,temporary);}catch{await copyFile(source,temporary);}if((await stat(temporary)).size!==size)throw new Error('Ollama layer copy was incomplete');await rename(temporary,destination);}
 finally{await unlink(temporary).catch(()=>{});}
}
export async function listOllamaModels(root=defaultRoot()){
 const base=join(root,'manifests'),models:any[]=[];
 async function scan(folder:string,depth=0){if(depth>8)return;let entries;try{entries=await readdir(folder,{withFileTypes:true});}catch(error){if((error as any).code==='ENOENT')return;throw error;}
  for(const file of entries){const path=join(folder,file.name);if(file.isDirectory())await scan(path,depth+1);else if(file.isFile()){try{const manifest=await jsonFile(path);const parts=relative(base,path).split(/[\\/]/);if(parts.length<3||!Array.isArray(manifest.layers))continue;const tag=parts.pop();const registry=parts.shift();const name=(parts[0]==='library'?parts.slice(1):parts).join('/')+':'+tag;const weights=manifest.layers.filter((layer:any)=>layer.mediaType==='application/vnd.ollama.image.model');models.push({id:Buffer.from(relative(base,path)).toString('base64url'),name:(registry==='registry.ollama.ai'?'':registry+'/')+name,size:weights.reduce((n:number,layer:any)=>n+Number(layer.size??0),0),available:weights.length===1,manifestPath:path});}catch{}}
  }
 }
 await scan(base);return models;
}
export function ollamaConfiguration(parameters:any){const config:any={engine:'llama.cpp'};const map:any={num_ctx:'contextTokens',temperature:'temperature',top_k:'topK',top_p:'topP',repeat_penalty:'repeatPenalty',seed:'seed',stop:'stop'};
 for(const [key,target] of Object.entries(map))if(parameters[key]!==undefined)config[String(target)]=parameters[key];return config;}
export async function importOllamaModel(context:AppContext,id:string,root=defaultRoot()){
 const item=(await listOllamaModels(root)).find(model=>model.id===id);if(!item)throw new Error('Ollama model was not found in local storage');if(!item.available)throw new Error('This Ollama model does not contain a single supported GGUF weights file');
 const manifest=await jsonFile(item.manifestPath);const hash=createHash('sha256').update(JSON.stringify(manifest)).digest('hex');const entryId='ollama-'+hash;
 const existing=context.store.get('local_models',entryId);if(existing)return existing;
 const directory=join(context.dataDirectory,'models','ollama',hash);await mkdir(directory,{recursive:true});
 const preserved:any={name:item.name,manifest,parameters:{},config:await jsonFile(digestFile(root,manifest.config.digest)),layers:[]};
 let modelPath='';
 for(const layer of manifest.layers){const source=digestFile(root,layer.digest);const info=await stat(source);if(!info.isFile()||info.size!==layer.size)throw new Error('Missing or incomplete Ollama layer: '+layer.mediaType);
  const kind=String(layer.mediaType).split('.').at(-1)!;const filename=kind==='model'?'model.gguf':layer.digest.replace(':','-')+'.blob';const destination=join(directory,filename);
  if(kind==='model'){const handle=await open(source,'r');try{const magic=Buffer.alloc(4);await handle.read(magic,0,4,0);if(magic.toString()!=='GGUF')throw new Error('Ollama weights are not a supported GGUF file');}finally{await handle.close();}modelPath=destination;}
  await preserveBlob(source,destination,info.size);
  preserved.layers.push({...layer,file:filename});
  if(['params','system','template','license','messages'].includes(kind)){if(info.size>2*1024*1024)throw new Error('Ollama metadata layer exceeds the supported size');const text=await readFile(source,'utf8');if(kind==='params')preserved.parameters=JSON.parse(text);else if(kind==='system'||kind==='template')preserved[kind]=text;}
 }
 const configuration=ollamaConfiguration(preserved.parameters);
 const warnings=['Ollama metadata and all layers are preserved. A GGUF chat template is required and checked on first use. The original Ollama Go template is retained as metadata; Ollama-only Go templates cannot be executed by this runtime.'];
 if(manifest.layers.some((layer:any)=>/\.(draft|adapter)$/.test(layer.mediaType)))warnings.push('Draft and adapter layers are preserved but are not enabled by this inference runtime.');
 preserved.warnings=warnings;
 await writeFile(join(directory,'ollama-metadata.json'),JSON.stringify(preserved,null,2));
 await writeFile(join(directory,'model.json'),JSON.stringify(configuration,null,2));
 return context.store.put('local_models',{id:entryId,name:item.name,path:modelPath,configuration,ollama:preserved,source:{type:'ollama',metadataPath:join(directory,'ollama-metadata.json'),name:item.name},warnings});
}
