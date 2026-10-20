import {registerOwnedProcess} from '../runtime/managed-process.ts';
import type {AppContext} from '../app.ts';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';import {join} from 'node:path';import {access,cp,mkdir} from 'node:fs/promises';
const exec=promisify(execFile);
export class EngineEnvironment {
 status='idle';error='';log='';private installing?:Promise<string>;private profile='python';
 constructor(private root:string,private app?:AppContext){}
 get dataRoot(){return process.env.OPENCLAUDE_DATA_DIR??join(this.root,'.local');}
 get python(){return join(this.dataRoot,'inference',this.profile,process.platform==='win32'?'Scripts/python.exe':'bin/python');}
 async ensure(engine:string,device='auto'):Promise<string>{
  if(!['llama.cpp','mlx','transformers','download'].includes(engine))throw new Error('Unknown runtime environment');
  if(this.installing){await this.installing;return this.ensure(engine,device);}
  this.installing=this.prepare(engine,device).finally(()=>{this.installing=undefined;});return this.installing;
 }
 private async prepare(engine:string,device:string){
  this.profile=engine==='download'?'downloads':engine==='transformers'?'transformers':'python';
  let needsCuda=device==='cuda';
  if(device==='auto'&&process.platform!=='darwin')try{await exec('nvidia-smi',['--query-gpu=name','--format=csv,noheader'],{windowsHide:true,timeout:8000});needsCuda=true;}catch{}
  let probe:string;
  if(engine==='download')probe='import huggingface_hub;assert huggingface_hub.__version__=="2.2.0"';
  else if(engine==='transformers')probe='import torch,transformers,accelerate,psutil,lmformatenforcer;assert torch.__version__.split("+")[0]=="2.14.1";assert transformers.__version__=="5.19.0"'+(needsCuda?';assert torch.cuda.is_available(),"CUDA PyTorch cannot access the GPU; check the NVIDIA driver"':'');
  else{const module=engine==='mlx'?'mlx_lm':'llama_cpp';probe='import sys;sys.path.insert(0,'+JSON.stringify(join(this.root,'runtime/models'))+');import native_worker;import '+module+(engine==='mlx'?'':';assert '+module+'.__version__=="0.3.36"'+(needsCuda?';assert '+module+'.llama_supports_gpu_offload();assert "CUDA" in '+module+'.llama_print_system_info().decode()':''));}
  try{await exec(this.python,['-c',probe],{windowsHide:true,timeout:30000});this.status='ready';return this.python;}catch{}
  return this.install(engine,needsCuda,probe);
 }
 private async run(command:string,args:string[]){await new Promise<void>((resolve,reject)=>{const child=spawn(command,args,{env:{...process.env,OPENCLAUDE_HOST_TOKEN:undefined},windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});if(this.app)registerOwnedProcess(this.app,child,'inference-setup',command,process.platform!=='win32');for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{this.log=(this.log+chunk.toString()).slice(-6000);});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Runtime setup failed: '+this.log.slice(-2000))));});}
 private async install(engine:string,cuda:boolean,probe:string){
  this.status='installing';this.error='';this.log='';
  try{
   if(engine==='mlx'&&(process.platform!=='darwin'||process.arch!=='arm64'))throw new Error('MLX requires an Apple Silicon Mac');
   try{await access(this.python);}catch{
    let base=process.env.OPENCLAUDE_PYTHON??'python';
    if(process.env.OPENCLAUDE_BUNDLED_PYTHON){const target=join(this.dataRoot,'inference','base-python');base=join(target,process.platform==='win32'?'python.exe':'bin/python3');try{await access(base);}catch{await mkdir(join(this.dataRoot,'inference'),{recursive:true});await cp(process.env.OPENCLAUDE_BUNDLED_PYTHON,target,{recursive:true});}}
    await this.run(base,['-m','venv',join(this.dataRoot,'inference',this.profile)]);
   }
   if(engine==='download')await this.run(this.python,['-m','pip','install','--only-binary=:all:','huggingface_hub==2.2.0']);
   else if(engine==='transformers'){
    const args=['-m','pip','install','--only-binary=:all:'];if(process.platform!=='darwin')args.push('--index-url','https://download.pytorch.org/whl/'+(cuda?'cu130':'cpu'));args.push('torch==2.14.1');await this.run(this.python,args);
    await this.run(this.python,['-m','pip','install','-r',join(this.root,'runtime/models/requirements.txt')]);
   }
   else if(engine==='mlx')await this.run(this.python,['-m','pip','install','mlx-lm==0.32.0']);
   else{
    const variant=cuda?'cu132':process.platform==='darwin'&&process.arch==='arm64'?'metal':'cpu';
    await this.run(this.python,['-m','pip','install','--force-reinstall','--only-binary=:all:','--extra-index-url','https://abetlen.github.io/llama-cpp-python/whl/'+variant,'llama-cpp-python==0.3.36']);
    if(variant==='cu132'&&process.platform==='win32')await this.run(this.python,['-m','pip','install','--only-binary=:all:','nvidia-cublas==13.2.2.2']);
   }
   await this.run(this.python,['-c',probe]);this.status='ready';return this.python;
  }catch(error){this.status='failed';this.error=(error as Error).message;throw error;}
 }
}
export function engineFor(path:string,config:any={},platform:string=process.platform,arch:string=process.arch){
 const engine=config.engine&&config.engine!=='auto'?config.engine:path.toLowerCase().endsWith('.gguf')?'llama.cpp':'transformers';
 if(!['llama.cpp','mlx','transformers'].includes(engine))throw new Error('Unknown inference engine');
 if(engine==='mlx'&&(platform!=='darwin'||arch!=='arm64'))throw new Error('MLX requires an Apple Silicon Mac');
 if(config.device==='metal'&&(platform!=='darwin'||arch!=='arm64'))throw new Error('Metal requires an Apple Silicon Mac');
 if(config.device==='cuda'&&platform==='darwin')throw new Error('CUDA is not available on macOS');
 if(engine==='mlx'&&config.device&&!['auto','metal'].includes(config.device))throw new Error('MLX uses the Apple Silicon Metal backend');
 if(engine==='llama.cpp'&&!path.toLowerCase().endsWith('.gguf'))throw new Error('llama.cpp requires a GGUF model file');
 if(engine==='transformers'&&path.toLowerCase().endsWith('.gguf'))throw new Error('Load GGUF using llama.cpp to preserve quantized weights');
 if(engine==='mlx'&&path.toLowerCase().endsWith('.gguf'))throw new Error('MLX requires an MLX-compatible safetensors folder');
 if(config.loraAdapters?.some((adapter:any)=>adapter.enabled!==false)&&engine!=='llama.cpp')throw new Error('LoRA adapters currently require the GGUF llama.cpp engine');
 return engine;
}
export function validateModelSettings(config:any){
 if(!config||typeof config!=='object'||Array.isArray(config))throw new Error('Invalid model settings');
 const limits:any={contextTokens:[128,2147483647],outputTokens:[1,2147483647],threads:[1,1024],gpuLayers:[-1,99999],batchSize:[1,32768],microBatchSize:[1,32768],parallelPredictions:[1,8],topK:[0,2147483647],seed:[-1,4294967295],imageMaxTokens:[64,16384]};
 for(const [key,value] of Object.entries(config)){
  if(value===undefined)continue;
  if(key in limits){const [min,max]=limits[key];if(!Number.isSafeInteger(value)||Number(value)<min||Number(value)>max)throw new Error(key==='gpuLayers'?'GPU layers must be -1 (all), 0 (CPU), or a positive integer':'Invalid '+key);}
  else if(key==='temperature'){if(!Number.isFinite(value)||Number(value)<0||Number(value)>2)throw new Error('Invalid temperature');}
  else if(key==='topP'){if(!Number.isFinite(value)||Number(value)<0||Number(value)>1)throw new Error('Invalid top P');}
  else if(key==='repeatPenalty'){if(!Number.isFinite(value)||Number(value)<=0||Number(value)>10)throw new Error('Invalid repeat penalty');}
  else if(key==='stop'){if(!Array.isArray(value)||value.length>100||value.some(item=>typeof item!=='string'||item.length>1000))throw new Error('Invalid stop sequences');}
  else if(key==='engine'){if(!['auto','llama.cpp','mlx','transformers'].includes(String(value)))throw new Error('Invalid engine');}
  else if(key==='runtimeVariant'){if(!['stock','prism'].includes(String(value)))throw new Error('Invalid llama.cpp runtime variant');}
  else if(key==='device'){if(!['auto','cpu','cuda','metal'].includes(String(value)))throw new Error('Invalid compute device');}
  else if(key==='cacheType'){if(!['auto','f16','q8_0','q4_0'].includes(String(value)))throw new Error('Invalid KV cache precision');}
  else if(key==='memoryMode'){if(!['gpu','balanced'].includes(String(value)))throw new Error('Invalid memory placement mode');}
  else if(key==='flashAttention'){if(!['auto','on','off'].includes(String(value)))throw new Error('Invalid Flash Attention setting');}
  else if(key==='promptCache'){if(typeof value!=='boolean')throw new Error('Invalid prompt cache setting');}
  else if(key==='loraAdapters'){if(!Array.isArray(value)||value.length>8||value.some(adapter=>!adapter||typeof adapter!=='object'||typeof adapter.path!=='string'||!adapter.path.trim()||adapter.path.length>3000||/[\r\n\0]/.test(adapter.path)||!adapter.path.toLowerCase().endsWith('.gguf')||adapter.scale!==undefined&&(!Number.isFinite(adapter.scale)||Math.abs(adapter.scale)>10)||adapter.enabled!==undefined&&typeof adapter.enabled!=='boolean'||Object.keys(adapter).some(key=>!['path','scale','enabled'].includes(key))))throw new Error('Invalid LoRA adapters; choose up to 8 GGUF adapters with finite scales between -10 and 10');}
  else if(key==='visionEnabled'){if(typeof value!=='boolean')throw new Error('Invalid vision setting');}
  else if(key==='visionProjectorPath'){if(typeof value!=='string'||value.length>3000||/[\r\n\0]/.test(value))throw new Error('Invalid vision projector path');}
  else if(key==='capabilities'){if(!Array.isArray(value)||value.some(item=>item!=='tools'))throw new Error('Only the tools capability can be overridden; vision and reasoning are detected by the runtime');}
  else throw new Error('Unknown model setting: '+key);
 }
 if(config.flashAttention==='off'&&config.cacheType&& !['auto','f16'].includes(config.cacheType))throw new Error('Quantized KV cache requires Flash Attention; choose F16 or enable Flash Attention');
 if(config.flashAttention==='on'&&(config.device==='cpu'||config.gpuLayers===0))throw new Error('Flash Attention requires GPU offload');
 if(config.contextTokens&&config.outputTokens>config.contextTokens)throw new Error('Output limit must not exceed context window');
 return config;
}
