const resources=new Set(['config.json','generation_config.json','tokenizer.json','tokenizer_config.json','special_tokens_map.json','added_tokens.json','vocab.json','vocab.txt','merges.txt','tokenizer.model','spiece.model','sentencepiece.bpe.model','chat_template.jinja','preprocessor_config.json','processor_config.json']);
export async function modelDownloadPlan(files:{name:string}[],readIndex:()=>Promise<any>){
 const names=new Set(files.map(file=>file.name));const support=files.filter(file=>resources.has(file.name)).map(file=>file.name);
 const projectorFiles=files.filter(file=>/\.gguf$/i.test(file.name)&&/(?:^|[/_.-])(?:mmproj|projector)(?:[_.-]|$)/i.test(file.name));
 const gguf=files.filter(file=>file.name.endsWith('.gguf')&&!projectorFiles.includes(file)&&!/-\d+-of-\d+\.gguf$/i.test(file.name));const splitExcluded=files.filter(file=>/-\d+-of-\d+\.gguf$/i.test(file.name)).length;
 let safetensorsFiles:string[]=[];let reason='';
 if(names.has('config.json')){
  if(names.has('model.safetensors.index.json')){const index=await readIndex();const shards=[...new Set(Object.values(index.weight_map??{}))];if(!shards.length||shards.some(name=>typeof name!=='string'||!name.endsWith('.safetensors')||!names.has(name)||name.split(/[\\/]/).includes('..')))throw new Error('The model shard index references missing or unsafe weight files');safetensorsFiles=[...support,'model.safetensors.index.json',...shards as string[]];}
  else if(names.has('model.safetensors'))safetensorsFiles=[...support,'model.safetensors'];
  else if(files.some(file=>file.name.endsWith('.safetensors')))reason='This repository contains alternate weight files without a standard model index. Choose an unambiguous model repository or import the complete local folder from Models.';
 }
 return {safetensorsFiles,ggufFiles:gguf,projectorFiles,resources:support,splitExcluded,reason};
}
