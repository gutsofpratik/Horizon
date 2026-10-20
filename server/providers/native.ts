import {reasoningOptions,omitSampling,type ProviderModelOptions} from './model-options.ts';
import {randomUUID} from 'node:crypto';
import type {GenerateRequest,Provider} from './adapter.ts';
export const parseArguments=(value:any)=>{try{const parsed=typeof value==='string'?JSON.parse(value||'{}'):value??{};if(typeof parsed!=='object'||!parsed||Array.isArray(parsed))throw new Error();return {arguments:parsed};}catch{return {arguments:{},argumentError:'Tool arguments were malformed or incomplete JSON; no action was executed.'};}};
const args=(call:any)=>parseArguments(call.function?.arguments).arguments;
const text=(message:any)=>typeof message.content==='string'?message.content:'';
const imageType=(image:string)=>image.startsWith('iVBOR')?'image/png':image.startsWith('R0lGOD')?'image/gif':image.startsWith('UklGR')?'image/webp':'image/jpeg';
const system=(r:GenerateRequest)=>r.messages.filter(m=>m.role==='system').map(text).join('\n\n');
export function anthropicBody(r:GenerateRequest,options?:ProviderModelOptions){
 const messages:any[]=[];
 for(const m of r.messages.filter(m=>m.role!=='system')){
  let content:any[];
  if(m.role==='tool')content=[{type:'tool_result',tool_use_id:m.tool_call_id,content:text(m)}];
  else if(m.providerData?.anthropic)content=m.providerData.anthropic;
  else content=[...(text(m)?[{type:'text',text:text(m)}]:[]),...(m.images??[]).map((data:string)=>({type:'image',source:{type:'base64',media_type:imageType(data),data}})),...(m.tool_calls??[]).map((c:any)=>({type:'tool_use',id:c.id,name:c.function.name,input:args(c)}))];
  const role=m.role==='assistant'?'assistant':'user';if(!content.length)continue;
  if(messages.at(-1)?.role===role)messages.at(-1).content.push(...content);else messages.push({role,content});
 }
 return {...reasoningOptions(r,options),model:r.model,messages,stream:true,max_tokens:r.maxTokens??4096,...(system(r)?{system:system(r)}:{}),...(!omitSampling(options)&&r.temperature!==undefined?{temperature:r.temperature}:{}),...(r.tools?.length?{tools:r.tools.map(t=>({name:t.function.name,description:t.function.description,input_schema:t.function.parameters})),tool_choice:{type:r.toolChoice==='required'&&!['anthropic-adaptive','anthropic-budget'].includes(options?.thinkingControl??'')?'any':'auto'}}:{})};
}
export function geminiBody(r:GenerateRequest,options?:ProviderModelOptions){
 const contents:any[]=[];const names=new Map<string,string>();for(const m of r.messages)for(const c of m.tool_calls??[])names.set(c.id,c.function.name);
 for(const m of r.messages.filter(m=>m.role!=='system')){
  const parts=m.providerData?.gemini??(m.role==='tool'?[{functionResponse:{id:m.tool_call_id,name:m.tool_name??names.get(m.tool_call_id)??'tool',response:{result:text(m)}}}]:[...(text(m)?[{text:text(m)}]:[]),...(m.images??[]).map((data:string)=>({inlineData:{mimeType:imageType(data),data}})),...(m.tool_calls??[]).map((c:any)=>({functionCall:{id:c.id,name:c.function.name,args:args(c)},...(c.providerData?.thoughtSignature?{thoughtSignature:c.providerData.thoughtSignature}:{})}))]);
  if(!parts.length)continue;const role=m.role==='assistant'?'model':'user';if(contents.at(-1)?.role===role)contents.at(-1).parts.push(...parts);else contents.push({role,parts});
 }
 return {contents,...(system(r)?{systemInstruction:{parts:[{text:system(r)}]}}:{}),generationConfig:{...reasoningOptions(r,options),...(!omitSampling(options)&&r.temperature!==undefined?{temperature:r.temperature}:{}),...(r.maxTokens!==undefined?{maxOutputTokens:r.maxTokens}:{}),...(r.outputFormat?{responseMimeType:'application/json'}:{})},...(r.tools?.length?{tools:[{functionDeclarations:r.tools.map(t=>({name:t.function.name,description:t.function.description,parametersJsonSchema:t.function.parameters}))}],toolConfig:{functionCallingConfig:{mode:r.toolChoice==='required'?'ANY':'AUTO'}}}:{})};
}
export function responsesBody(r:GenerateRequest,options?:ProviderModelOptions){
 const input=r.messages.flatMap(m=>{
  if(m.role==='tool')return [{type:'function_call_output',call_id:m.tool_call_id,output:text(m)}];
  if(m.providerData?.responses)return m.providerData.responses;
  return [...(text(m)||m.images?.length?[{role:m.role,content:[...(text(m)?[{type:m.role==='assistant'?'output_text':'input_text',text:text(m)}]:[]),...(m.images??[]).map((data:string)=>({type:'input_image',image_url:`data:${imageType(data)};base64,${data}`}))]}]:[]),...(m.tool_calls??[]).map((c:any)=>({type:'function_call',call_id:c.id,name:c.function.name,arguments:JSON.stringify(args(c))}))];
 });
 return {...reasoningOptions(r,options),model:r.model,input,stream:true,store:false,include:['reasoning.encrypted_content'],...(r.maxTokens!==undefined?{max_output_tokens:r.maxTokens}:{}),...(!omitSampling(options)&&r.temperature!==undefined?{temperature:r.temperature}:{}),...(r.outputFormat?{text:{format:{type:'json_object'}}}:{}),...(r.tools?.length?{tools:r.tools.map(t=>({type:'function',name:t.function.name,description:t.function.description,parameters:t.function.parameters,strict:false})),tool_choice:r.toolChoice??'auto'}:{})};
}
const usage=(value:any)=>({...value,input:value?.input_tokens??value?.promptTokenCount,output:value?.output_tokens??value?.candidatesTokenCount,prompt_tokens:value?.input_tokens??value?.promptTokenCount,completion_tokens:value?.output_tokens??value?.candidatesTokenCount});
export async function* nativeEvents(records:AsyncIterable<any>,type:Provider['type']):AsyncGenerator<any>{
 let finished=false,reason:any,counts:any={};const blocks=new Map<number,any>();const calls=new Map<string,any>();const parts:any[]=[];const responseItems:any[]=[];
 for await(const record of records){
  if(record.error||record.type==='error')throw new Error(record.error?.message??record.message??'Provider stream failed');
  if(type==='anthropic'){
   if(record.type==='message_start')counts={...record.message?.usage};
   if(record.type==='content_block_start'){blocks.set(record.index,{...record.content_block});const b=record.content_block;if(b.type==='text'&&b.text)yield {type:'content',text:b.text};}
   if(record.type==='content_block_delta'){const b=blocks.get(record.index);if(!b)throw new Error('Unexpected Anthropic content block');const d=record.delta;if(d.text){b.text=(b.text??'')+d.text;yield {type:'content',text:d.text};}if(d.thinking){b.thinking=(b.thinking??'')+d.thinking;yield {type:'reasoning',text:d.thinking};}if(d.signature)b.signature=(b.signature??'')+d.signature;if(d.partial_json){b.partial=(b.partial??'')+d.partial_json;if(b.partial.length>1048576)throw new Error('Tool arguments are too large');yield {type:'tool_progress',id:b.id,name:b.name,argumentBytes:Buffer.byteLength(b.partial)};}}
   if(record.type==='message_delta'){reason=record.delta?.stop_reason;counts={...counts,...record.usage};}
   if(record.type==='message_stop'){
    if(!['end_turn','tool_use','stop_sequence'].includes(reason))throw new Error('Anthropic generation did not complete: '+reason);
    const native=[...blocks.values()].map(({partial,...b})=>({...b,...(b.type==='tool_use'?{input:parseArguments(partial??b.input).arguments}:{})}));
    for(const b of blocks.values())if(b.type==='tool_use')yield {type:'tool_call',id:b.id,name:b.name,...parseArguments(b.partial??b.input)};
    yield {type:'provider_metadata',providerData:{anthropic:native}};finished=true;yield {type:'done',reason,usage:usage(counts)};
   }
  }else if(type==='gemini'||type==='vertex'){
   if(record.promptFeedback?.blockReason)throw new Error('Gemini blocked the prompt: '+record.promptFeedback.blockReason);
   const c=record.candidates?.[0];for(const part of c?.content?.parts??[]){parts.push(part);if(part.text)yield {type:part.thought?'reasoning':'content',text:part.text};if(part.functionCall){const f=part.functionCall;const id=f.id??randomUUID();calls.set(id,{id,name:f.name,...parseArguments(f.args),...(part.thoughtSignature?{providerData:{thoughtSignature:part.thoughtSignature}}:{})});part.functionCall={...f,id};}}
   if(record.usageMetadata)counts=record.usageMetadata;if(c?.finishReason){reason=c.finishReason;finished=true;}
  }else{
   if(record.type==='response.output_text.delta')yield {type:'content',text:record.delta};
   if(record.type==='response.reasoning_summary_text.delta')yield {type:'reasoning',text:record.delta};
   if(record.type==='response.output_item.added'&&record.item?.type==='function_call')calls.set(record.item.id,{id:record.item.call_id,name:record.item.name,raw:record.item.arguments??''});
   if(record.type==='response.function_call_arguments.delta'){const c=calls.get(record.item_id);if(!c)throw new Error('Unexpected Responses tool delta');c.raw+=record.delta;if(c.raw.length>1048576)throw new Error('Tool arguments are too large');yield {type:'tool_progress',id:c.id,name:c.name,argumentBytes:Buffer.byteLength(c.raw)};}
   if(record.type==='response.output_item.done')responseItems.push(record.item);
   if(['response.failed','response.incomplete'].includes(record.type))throw new Error(record.response?.error?.message??'Response did not complete: '+(record.response?.incomplete_details?.reason??record.type));
   if(record.type==='response.completed'){for(const c of calls.values())yield {type:'tool_call',id:c.id,name:c.name,...parseArguments(c.raw)};yield {type:'provider_metadata',providerData:{responses:record.response?.output??responseItems}};finished=true;yield {type:'done',reason:'completed',usage:usage(record.response?.usage)};}
  }
 }
 if(!finished)throw new Error('Model stream ended before completion');
 if(type==='gemini'||type==='vertex'){
  if(!['STOP','FINISH_REASON_UNSPECIFIED'].includes(reason))throw new Error('Gemini generation did not complete: '+reason);
  for(const call of calls.values())yield {type:'tool_call',...call};yield {type:'provider_metadata',providerData:{gemini:parts}};yield {type:'done',reason,usage:usage(counts)};
 }
}
