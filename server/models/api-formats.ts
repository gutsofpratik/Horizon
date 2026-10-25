// Translate supported OpenAI text APIs to the existing local generation contract.
export function responseRequest(body:any){
 if(body.previous_response_id||body.conversation)throw new Error('Send the full input history; hosted response storage is not available in the local endpoint');
 const messages:any[]=[];
 if(body.instructions)messages.push({role:'system',content:body.instructions});
 if(typeof body.input==='string')messages.push({role:'user',content:body.input});
 else if(Array.isArray(body.input))for(const item of body.input){
  if(item.type==='function_call_output'){messages.push({role:'tool',tool_call_id:item.call_id,content:typeof item.output==='string'?item.output:JSON.stringify(item.output)});continue;}
  if(item.type==='function_call'){messages.push({role:'assistant',content:null,tool_calls:[{id:item.call_id,type:'function',function:{name:item.name,arguments:item.arguments}}]});continue;}
  if(!['user','assistant','system','developer'].includes(item.role))throw new Error('Unsupported response input item');
  const content=typeof item.content==='string'?item.content:item.content?.map((part:any)=>{
   if(['input_text','output_text'].includes(part.type))return {type:'text',text:part.text};
   if(part.type==='input_image')return {type:'image_url',image_url:{url:part.image_url,...(part.detail?{detail:part.detail}:{})}};
   throw new Error('This input modality is not supported by the local endpoint');
  });messages.push({role:item.role==='developer'?'system':item.role,content});
 }
 const tools=body.tools?.map((tool:any)=>{if(tool.type!=='function')throw new Error('Only client-defined function tools are supported');return {type:'function',function:{name:tool.name,description:tool.description,parameters:tool.parameters,strict:tool.strict}};});
 const toolChoice=body.tool_choice?.type==='function'?{type:'function',function:{name:body.tool_choice.name}}:body.tool_choice;
 return {...body,messages,tools,tool_choice:toolChoice,max_tokens:body.max_output_tokens};
}
export function responseOutput(id:string,model:string,created:number,text:string,calls:any[],usage:any,status='completed'){
 return {id,object:'response',created_at:created,status,model,error:null,incomplete_details:null,output:[
  ...(text?[{id:id+'_message',type:'message',status:'completed',role:'assistant',content:[{type:'output_text',text,annotations:[]}]}]:[]),
  ...calls.filter(Boolean).map((call,index)=>({id:id+'_call_'+index,type:'function_call',status:'completed',call_id:call.id,name:call.function.name,arguments:call.function.arguments})),
 ],usage:{input_tokens:usage?.prompt_tokens??0,output_tokens:usage?.completion_tokens??0,total_tokens:usage?.total_tokens??((usage?.prompt_tokens??0)+(usage?.completion_tokens??0))}};
}
