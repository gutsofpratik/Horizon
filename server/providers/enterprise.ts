import {reasoningOptions,omitSampling,selectedModelOptions,type ProviderModelOptions} from './model-options.ts';
import {BedrockRuntimeClient,ConverseStreamCommand,type ConverseStreamCommandInput} from '@aws-sdk/client-bedrock-runtime';
import {fromNodeProviderChain} from '@aws-sdk/credential-providers';
import {GoogleAuth} from 'google-auth-library';
import type {GenerateRequest,Provider} from './adapter.ts';
import {parseArguments} from './native.ts';
export async function vertexEndpoint(provider:Provider,model:string){
 const auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform'],projectId:provider.projectId});
 const token=await auth.getAccessToken();if(!token)throw new Error('Google Application Default Credentials did not provide an access token');
 const location=provider.location??'us-central1';const host=location==='global'?'aiplatform.googleapis.com':`${location}-aiplatform.googleapis.com`;
 return {url:`https://${host}/v1/projects/${encodeURIComponent(provider.projectId!)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,headers:{Authorization:`Bearer ${token}`}};
}
export function bedrockBody(r:GenerateRequest,options?:ProviderModelOptions){
 const messages:any[]=[];
 for(const m of r.messages.filter(m=>m.role!=='system')){
  const content=m.providerData?.bedrock??(m.role==='tool'?[{toolResult:{toolUseId:m.tool_call_id,content:[{text:String(m.content??'')}]}}]:[...(m.content?[{text:String(m.content)}]:[]),...(m.images??[]).map((data:string)=>({image:{format:data.startsWith('iVBOR')?'png':data.startsWith('R0lGOD')?'gif':data.startsWith('UklGR')?'webp':'jpeg',source:{bytes:Buffer.from(data,'base64')}}})),...(m.tool_calls??[]).map((c:any)=>({toolUse:{toolUseId:c.id,name:c.function.name,input:parseArguments(c.function.arguments).arguments}}))]);
  if(!content.length)continue;const role=m.role==='assistant'?'assistant':'user';if(messages.at(-1)?.role===role)messages.at(-1).content.push(...content);else messages.push({role,content});
 }
 return {...(options&&options.thinkingControl!=='provider-default'?{additionalModelRequestFields:reasoningOptions(r,options)}:{}),modelId:r.model,messages,system:r.messages.filter(m=>m.role==='system').map(m=>({text:String(m.content??'')})),inferenceConfig:{...(r.maxTokens!==undefined?{maxTokens:r.maxTokens}:{}),...(!omitSampling(options)&&r.temperature!==undefined?{temperature:r.temperature}:{})},...(r.tools?.length?{toolConfig:{tools:r.tools.map(t=>({toolSpec:{name:t.function.name,description:t.function.description,inputSchema:{json:t.function.parameters}}})),toolChoice:r.toolChoice==='required'&&!['anthropic-adaptive','anthropic-budget'].includes(options?.thinkingControl??'')?{any:{}}:{auto:{}}}}:{})};
}
export async function* bedrockEvents(records:AsyncIterable<any>):AsyncGenerator<any>{
 const blocks=new Map<number,any>();let stopped=false,reason:any,counts:any;
 for await(const record of records){
  for(const key of ['internalServerException','modelStreamErrorException','validationException','throttlingException','serviceUnavailableException'])if(record[key])throw new Error(record[key].message??key);
  if(record.contentBlockStart){const {contentBlockIndex:index,start}=record.contentBlockStart;blocks.set(index,start.toolUse?{toolUse:{...start.toolUse},raw:''}:{});}
  if(record.contentBlockDelta){const {contentBlockIndex:index,delta}=record.contentBlockDelta;const b=blocks.get(index)??{};blocks.set(index,b);if(delta.text){b.text=(b.text??'')+delta.text;yield {type:'content',text:delta.text};}if(delta.toolUse?.input){b.raw=(b.raw??'')+delta.toolUse.input;if(b.raw.length>1048576)throw new Error('Tool arguments are too large');yield {type:'tool_progress',id:b.toolUse?.toolUseId,name:b.toolUse?.name,argumentBytes:Buffer.byteLength(b.raw)};}if(delta.reasoningContent){b.reasoningContent??={reasoningText:{text:'',signature:''}};if(delta.reasoningContent.text){b.reasoningContent.reasoningText.text+=delta.reasoningContent.text;yield {type:'reasoning',text:delta.reasoningContent.text};}if(delta.reasoningContent.signature)b.reasoningContent.reasoningText.signature+=delta.reasoningContent.signature;}}
  if(record.messageStop){stopped=true;reason=record.messageStop.stopReason;}
  if(record.metadata)counts=record.metadata.usage;
 }
 if(!stopped)throw new Error('Bedrock stream ended before completion');
 if(!['end_turn','tool_use','stop_sequence'].includes(reason))throw new Error('Bedrock generation did not complete: '+reason);
 for(const b of blocks.values())if(b.toolUse)yield {type:'tool_call',id:b.toolUse.toolUseId,name:b.toolUse.name,...parseArguments(b.raw)};
 const native=[...blocks.values()].map(({raw,...b})=>({...b,...(b.toolUse?{toolUse:{...b.toolUse,input:parseArguments(raw).arguments}}:{})}));
 yield {type:'provider_metadata',providerData:{bedrock:native}};yield {type:'done',reason,usage:{...counts,input:counts?.inputTokens,output:counts?.outputTokens,prompt_tokens:counts?.inputTokens,completion_tokens:counts?.outputTokens}};
}
export async function* generateBedrock(provider:Provider,r:GenerateRequest,signal:AbortSignal){
 const client=new BedrockRuntimeClient({region:provider.region,credentials:fromNodeProviderChain(provider.awsProfile?{profile:provider.awsProfile}:{}),...(provider.baseUrl?{endpoint:provider.baseUrl}:{})});
 try{const body=bedrockBody(r,selectedModelOptions(provider,r.model)) as ConverseStreamCommandInput;const response=await client.send(new ConverseStreamCommand(body),{abortSignal:signal});if(!response.stream)throw new Error('Bedrock returned no stream');yield* bedrockEvents(response.stream);}finally{client.destroy();}
}
