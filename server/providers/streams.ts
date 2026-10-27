import {randomUUID} from 'node:crypto';
function toolArguments(value:any){try{const parsed=typeof value==='string'?JSON.parse(value||'{}'):value;if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Arguments must be a JSON object');return {arguments:parsed};}catch{return {arguments:{},argumentError:'Tool arguments were malformed or incomplete JSON. Reissue a native function call with a complete JSON object matching the tool schema; no action was executed.'};}}
export async function* decodeRecords(body:ReadableStream<Uint8Array>,mode:'ndjson'|'sse'):AsyncGenerator<any>{
 const reader=body.getReader();const decoder=new TextDecoder();let pending='';
 const parse=(text:string)=>{const value=mode==='sse'?text.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n'):text.trim();if(!value)return undefined;if(value==='[DONE]')return {__done:true};return JSON.parse(value);};
 try{while(true){const {value,done}=await reader.read();pending+=done?decoder.decode():decoder.decode(value,{stream:true});pending=pending.replaceAll('\r\n','\n');if(pending.length>4*1024*1024)throw new Error('Model stream record is too large');const delimiter=mode==='sse'?'\n\n':'\n';let index;while((index=pending.indexOf(delimiter))>=0){const text=pending.slice(0,index);pending=pending.slice(index+delimiter.length);const record=parse(text);if(record)yield record;}if(done)break;}if(pending.trim()){const record=parse(pending);if(record)yield record;}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export async function* normalizeEvents(records:AsyncIterable<any>,provider:'ollama'|'openai'):AsyncGenerator<any>{
 const calls=new Map<number,{id:string;name:string;arguments:string;argumentError?:string}>();const ollamaCalls:any[]=[];let finished=false;
 for await(const record of records){
  if(record.error)throw new Error(typeof record.error==='string'?record.error:record.error.message??'Model request failed');
  if(provider==='ollama'){
   const message=record.message??{};if(message.content)yield {type:'content',text:message.content};if(message.thinking)yield {type:'reasoning',text:message.thinking};
   for(const call of message.tool_calls??[]){ollamaCalls.push({type:'tool_call',id:call.id??randomUUID(),name:call.function.name,...toolArguments(call.function.arguments)});}
   if(record.done&&!finished){if(ollamaCalls.length&&record.done_reason&&record.done_reason!=='stop')throw new Error('Ollama tool generation did not complete: '+record.done_reason+'; no tool was executed');for(const call of ollamaCalls)yield call;finished=true;yield {type:'done',reason:record.done_reason,usage:{input:record.prompt_eval_count,output:record.eval_count,prompt_tokens:record.prompt_eval_count,completion_tokens:record.eval_count,duration:record.total_duration}};}
  }else{
   const choice=record.choices?.[0];const delta=choice?.delta??{};
   if(delta.openclaude_phase)yield {type:'model_status',phase:delta.openclaude_phase};
   if(delta.openclaude_progress)yield {type:'model_progress',...delta.openclaude_progress};
   if(delta.content)yield {type:'content',text:delta.content};if(delta.reasoning_content??delta.reasoning)yield {type:'reasoning',text:delta.reasoning_content??delta.reasoning};
   for(const part of delta.tool_calls??[]){const index=part.index??0;const previous=calls.get(index)??{id:part.id??randomUUID(),name:'',arguments:''};if(typeof part.function?.argument_error==='string')(previous as any).argumentError=part.function.argument_error;if(part.id)previous.id=part.id;if(part.function?.name)previous.name+=part.function.name;previous.arguments+=part.function?.arguments??'';if(previous.arguments.length>1024*1024)throw new Error('Model tool arguments are too large');calls.set(index,previous);yield {type:'tool_progress',id:previous.id,name:previous.name,argumentBytes:Buffer.byteLength(previous.arguments)};}
   if(choice?.finish_reason||record.__done){if(!finished){if(calls.size&&choice?.finish_reason&&!['stop','tool_calls','function_call'].includes(choice.finish_reason))throw new Error('Model tool generation did not complete: '+choice.finish_reason+'; no tool was executed');for(const call of calls.values()){if(!call.name)throw new Error('Missing tool name');yield {type:'tool_call',id:call.id,name:call.name,...toolArguments(call.arguments),...(call.argumentError?{arguments:{},argumentError:call.argumentError}:{})};}finished=true;yield {type:'done',reason:choice?.finish_reason,usage:record.usage};}}
  }
 }
 if(!finished)throw new Error('Model stream ended before completion');
}
