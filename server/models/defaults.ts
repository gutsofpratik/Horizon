import {z} from 'zod';
import {freemem,totalmem} from 'node:os';
import {stat,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
export const modelDefaultsSchema=z.object({minimumContext:z.number().int().min(512).max(262144).default(4096),autoFit:z.boolean().default(true),guardrail:z.enum(['off','relaxed','balanced','strong','custom']).default('balanced'),maximumModelGiB:z.number().min(.25).max(4096).default(16),ggufRuntime:z.enum(['auto','cpu','cuda','prism']).default('auto')}).strict();
export function applyRuntimeDefault(path:string,config:any,defaults:ReturnType<typeof modelDefaults>){
 if(!path.toLowerCase().endsWith('.gguf'))return config;
 if(defaults.ggufRuntime==='prism')return {...config,runtimeVariant:config.runtimeVariant??'prism'};
 if(['cpu','cuda'].includes(defaults.ggufRuntime))return {...config,device:config.device??defaults.ggufRuntime};
 return config;
}
export function modelDefaults(value:unknown={}){return modelDefaultsSchema.parse(value);}
export function runtimeConfiguration(path:string,configuration:any,defaults:ReturnType<typeof modelDefaults>){
 const config=applyRuntimeDefault(path,configuration??{},defaults);
 return {...config,...(!config.contextTokens?(path.toLowerCase().endsWith('.gguf')?{autoFitContext:defaults.autoFit,minimumContext:defaults.minimumContext}:{contextTokens:defaults.minimumContext}):{})};
}
export function guardrailLimit(defaults:ReturnType<typeof modelDefaults>,available:number,total:number){
 if(defaults.guardrail==='off')return Infinity;
 if(defaults.guardrail==='custom')return defaults.maximumModelGiB*1024**3;
 return Math.max(0,Math.min(available,total*({relaxed:.95,balanced:.8,strong:.65}[defaults.guardrail])));
}
async function weightBytes(path:string):Promise<number>{const info=await stat(path);if(info.isFile())return info.size;let bytes=0;for(const entry of await readdir(path,{withFileTypes:true}))if(entry.isFile()&&/\.(gguf|safetensors|bin)$/i.test(entry.name))bytes+=(await stat(join(path,entry.name))).size;return bytes;}
export async function checkLoadingGuardrail(path:string,defaults:ReturnType<typeof modelDefaults>,config:any={}){
 let available=freemem(),total=totalmem();
 if(config.device!=='cpu'&&config.gpuLayers!==0)try{const {stdout}=await promisify(execFile)('nvidia-smi',['--query-gpu=memory.free,memory.total','--format=csv,noheader,nounits'],{windowsHide:true,timeout:3000});for(const line of stdout.trim().split('\n')){const [free,size]=line.split(',').map(Number);if(Number.isFinite(free)&&Number.isFinite(size)){available+=free*1024**2;total+=size*1024**2;}}}catch{}
 const bytes=await weightBytes(path),limit=guardrailLimit(defaults,available,total);
 if(bytes>limit)throw new Error(`Model loading guardrail (${defaults.guardrail}): ${(bytes/1024**3).toFixed(1)} GiB of model files exceeds the ${(limit/1024**3).toFixed(1)} GiB loading limit. Change Model defaults to adjust the guardrail. Context, KV cache and runtime buffers require additional memory.`);
 return {weightBytes:bytes,limitBytes:Number.isFinite(limit)?limit:null};
}
