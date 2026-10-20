import {z} from 'zod';
import type {GenerateRequest,Provider} from './adapter.ts';

export const modelOption=z.object({
 thinkingControl:z.enum(['provider-default','anthropic-adaptive','anthropic-budget','gemini-budget','gemini-level','responses-effort','chat-effort']).default('provider-default'),
 effort:z.enum(['none','minimal','low','medium','high','xhigh']).default('medium'),
 fastEffort:z.enum(['none','minimal','low','medium','high','xhigh']).default('low'),
 budgetTokens:z.number().int().min(1024).max(131072).optional(),
 supportsDisable:z.boolean().default(false),
 omitTemperature:z.boolean().default(false),
 includeSummary:z.boolean().default(false),
 vision:z.boolean().optional(),
 tools:z.boolean().optional(),
}).strict();
export type ProviderModelOptions=z.infer<typeof modelOption>;
export const modelOptions=z.record(z.string().min(1).max(300),modelOption).refine(value=>Object.keys(value).length<=200,'At most 200 model configurations are supported');
export function selectedModelOptions(provider:Provider,model:string){const value=provider.modelOptions?.[model];return value?modelOption.parse(value):undefined;}
export function validateModelOptions(provider:Provider){
 if(!provider.modelOptions)return;
 const options=modelOptions.parse(provider.modelOptions);
 const protocols:Record<string,string[]>={
  'provider-default':['openai','responses','anthropic','gemini','azure','vertex','bedrock','ollama'],
  'anthropic-adaptive':['anthropic','bedrock'],'anthropic-budget':['anthropic','bedrock'],
  'gemini-budget':['gemini','vertex'],'gemini-level':['gemini','vertex'],
  'responses-effort':['responses','azure'],'chat-effort':['openai','azure'],
 };
 for(const [id,value] of Object.entries(options)){
  if(!protocols[value.thinkingControl]?.includes(provider.type))throw new Error('The thinking control for '+id+' does not match the provider protocol');
  if(provider.type==='azure'&&value.thinkingControl!=='provider-default'&&value.thinkingControl!==((provider.azureApi??'responses')==='chat'?'chat-effort':'responses-effort'))throw new Error('The thinking control must match this Azure deployment’s selected API');
  if(value.thinkingControl==='anthropic-adaptive'&&![value.effort,value.fastEffort].every(effort=>['low','medium','high','xhigh'].includes(effort)))throw new Error('Adaptive thinking requires a supported effort level for '+id);
  if(value.thinkingControl==='gemini-level'&&![value.effort,value.fastEffort].every(effort=>['minimal','low','medium','high'].includes(effort)))throw new Error('Gemini thinking levels must be minimal, low, medium or high for '+id);
 }
}
/** A configured contract is explicit user configuration, not inferred model capability. */
export function reasoningOptions(request:GenerateRequest,options?:ProviderModelOptions){
 if(!options||options.thinkingControl==='provider-default')return {};
 const fast=request.thinking===false;
 const effort=fast?options.fastEffort:options.effort;
 switch(options.thinkingControl){
  case 'anthropic-adaptive':return {thinking:fast&&options.supportsDisable?{type:'disabled'}:{type:'adaptive'},...(!(fast&&options.supportsDisable)?{output_config:{effort}}:{})};
  case 'anthropic-budget':{
   if(fast&&options.supportsDisable)return {thinking:{type:'disabled'}};
   const budget=options.budgetTokens??2048;
   if(request.maxTokens!==undefined&&request.maxTokens<=budget)throw new Error('This model’s configured thinking budget must be smaller than the response allowance. Lower its thinking budget or increase the allowance. The total context setting was not changed.');
   return {thinking:{type:'enabled',budget_tokens:budget}};
  }
  case 'gemini-budget':return {thinkingConfig:{includeThoughts:options.includeSummary,thinkingBudget:fast&&options.supportsDisable?0:options.budgetTokens??-1}};
  case 'gemini-level':return {thinkingConfig:{includeThoughts:options.includeSummary,thinkingLevel:effort}};
  case 'responses-effort':return {reasoning:{effort,...(options.includeSummary?{summary:'auto'}:{})}};
  case 'chat-effort':return {reasoning_effort:effort};
 }
}
export function omitSampling(options?:ProviderModelOptions){return !!options?.omitTemperature||options?.thinkingControl==='anthropic-adaptive'||options?.thinkingControl==='anthropic-budget';}
