import {toolReference,resolveToolTopic} from './reference.ts';
import {attachOperationSkill} from '../skills/tool-guidance.ts';
import {capabilityManifest} from './manifest.ts';
import {z} from 'zod';
import {ToolError,type ToolRegistry,type ToolContext} from './registry.ts';
import {publicToolDefinitions} from './groups.ts';
import {installedSkillRecommendations} from './discovery.ts';
import {catalogOperation,catalogOperations} from './catalog-operations.ts';
export function registerGateway(registry:ToolRegistry){registry.register({name:'toolkit',capability:'conversation',description:'Discover categorized tools by task or category name, read the returned actionable schemas (name=guide opens the operating manual), then call the category with schema-valid arguments. Relevant installed workflows are recommended on demand. Availability and permissions apply to every action.',input:z.discriminatedUnion('action',[z.object({action:z.literal('discover'),query:z.string().max(300).optional(),name:z.string().max(100).optional(),tool_action:z.string().max(100).optional()}).strict(),z.object({action:z.literal('call'),name:z.string().min(1).max(100),arguments:z.record(z.string(),z.json())}).strict()]),handler:async(args,ctx)=>{
 const eligible=publicToolDefinitions(registry,ctx).filter(tool=>!['toolkit','discover_tools'].includes(tool.function.name));
 if(args.action==='discover'){
  const recommendedSkills=await installedSkillRecommendations(ctx,args.query??args.name??'');
  if(args.name==='guide'){const guide={...toolReference(registry,ctx,args.query??'',args.tool_action),skills:recommendedSkills};return guide.registered&&!guide.available?{...guide,code:'RUNTIME_UNAVAILABLE',next:'Explain this actual runtime blocker once. Do not reinterpret it as a missing tool or bypass it with another channel.'}:attachOperationSkill(guide,registry,ctx);}
  const requested=resolveToolTopic(args.query??args.name??'');
  const topic=requested.category;
  const unavailable=toolReference(registry,ctx,topic,args.tool_action??requested.action);
  if(unavailable.actions?.length&&!unavailable.available)return {...unavailable,tools:[],skills:recommendedSkills,code:'RUNTIME_UNAVAILABLE',next:'Report the returned runtime blocker. The tool is registered; do not search for alternative spellings or claim a skill enables execution.'};
  // A category discovery must be actionable immediately. Returning only an
  // action index made models repeatedly discover instead of executing.
  if(eligible.some(tool=>tool.function.name===topic)){
   ctx.discoveredTools??=new Set();ctx.discoveredTools.add(topic);
   const action=args.tool_action??requested.action??({sheets:'create',slides:'create',browser:'open',computer:'screenshot',artifact:'create'} as Record<string,string>)[topic];
   const reference=toolReference(registry,ctx,topic,action);
   const tool=eligible.find(tool=>tool.function.name===topic)!.function;
   const options=tool.parameters?.oneOf??tool.parameters?.anyOf;
   const selected=action&&options?options.filter((branch:any)=>(branch.oneOf??branch.anyOf??[branch]).some((item:any)=>item.properties?.action?.const===action)):null;
   const parameters=selected?.length?{...(selected.length===1?selected[0]:{oneOf:selected}),...(tool.parameters.$defs?{$defs:tool.parameters.$defs}:{})}:tool.parameters;
   return attachOperationSkill({...reference,tools:[{...tool,parameters}],skills:recommendedSkills,next:'The action schema and example are supplied. Execute the requested action now; do not repeat discovery or ask the user which tool to use. Discover another tool_action only when a different operation is needed.'},registry,ctx);
  }
  if(topic==='catalog'||topic==='capabilities')return {capabilities:capabilityManifest(registry,ctx),operations:catalogOperations(registry,ctx),tools:[],skills:[],summary:'Reference capability inventory. Automatic control operations describe agent behavior; executable operations resolve to real category actions. Read an action schema before calling it. Runtime and permission limitations are reported explicitly.'};
  if(!topic)return {summary:'Choose an exact category name to read its action schema. Dotted catalog labels such as browser.open also resolve to supported actions.',categories:eligible.map(tool=>({name:tool.function.name,description:tool.function.description.slice(0,160)})),tools:[],skills:[]};
  const operation=args.name?catalogOperation(args.name,registry,ctx):null;
  if(operation&&!operation.available)return {tools:[],skills:[],operation,summary:operation.reason};
  const words=topic.split(/\s+/).filter(Boolean);const rank=(tool:any)=>args.name?Number(tool.function.name===args.name)*1000:Number(tool.function.name===topic.replaceAll(' ','_'))*1000+words.reduce((n:number,word:string)=>n+(tool.function.name.toLowerCase().includes(word)?10:0)+(tool.function.description.toLowerCase().includes(word)?1:0),0);
  const tools=eligible.map(tool=>({tool,score:operation?Number(tool.function.name===operation.category)*1000:rank(tool)})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score).slice(0,args.name?1:4).map(item=>item.tool.function);
  ctx.discoveredTools??=new Set();for(const tool of tools)ctx.discoveredTools.add(tool.name);
  const focused=tools.map(tool=>{const branches=tool.parameters?.oneOf;if(!branches)return tool;const selectedAction=args.tool_action??operation?.action;if(selectedAction){const selected=branches.filter((branch:any)=>{const variants=branch.oneOf??branch.anyOf??[branch];return variants.some((item:any)=>item.properties?.action?.const===selectedAction);});if(!selected.length)return {name:tool.name,error:'Unknown action '+selectedAction,actions:branches.flatMap((branch:any)=>(branch.oneOf??branch.anyOf??[branch]).map((item:any)=>item.properties?.action?.const))};return {...tool,parameters:{...(selected.length===1?selected[0]:{oneOf:selected}),...(tool.parameters.$defs?{$defs:tool.parameters.$defs}:{})},calling_guide:toolReference(registry,ctx,tool.name,selectedAction)};}return {name:tool.name,description:tool.description,actions:branches.flatMap((branch:any)=>(branch.oneOf??branch.anyOf??[branch]).map((item:any)=>({action:item.properties?.action?.const,description:item.description}))),next:'Discover this category again with tool_action to load one exact action schema.'};});return attachOperationSkill({tools:focused,operation,skills:recommendedSkills,summary:tools.length?'Use tool_action to load the exact action schema, then toolkit(action="call",name,arguments). Load matching installed skills with skill_load before their workflow.':'No enabled matching category. Refine the query or check runtime/permissions; do not claim access.'},registry,ctx);
 }
 if(['toolkit','discover_tools'].includes(args.name))throw new ToolError('INVALID_ARGUMENTS','Specify an actual category or offered tool; recursive gateway calls are not allowed');
 if(!eligible.some(tool=>tool.function.name===args.name)){const reference=toolReference(registry,ctx,args.name,typeof args.arguments.action==='string'?args.arguments.action:undefined);if(reference.actions?.length&&!reference.available)throw new ToolError('RUNTIME_UNAVAILABLE','The '+args.name+' tool is registered, but its runtime is unavailable: '+reference.unavailable_reason,{guidance:reference});throw new ToolError('TOOL_DISABLED','Tool unavailable or not permitted in this conversation: '+args.name);}
 const {executeGroupedLeaf}=await import('./groups.ts');
 return executeGroupedLeaf(registry,args.name,args.arguments,ctx);
}});}

/** Bind a discovered category's real schema inside the gateway arguments.
 * The sampler can then constrain rows/blocks/slides, rather than arbitrary JSON. */
export function specializeGateway(registry:ToolRegistry,ctx:ToolContext,definitions:any[]){
 const eligible=publicToolDefinitions(registry,ctx).filter(tool=>tool.function.name!=='toolkit'&&tool.function.name!=='discover_tools');
 const typedCategories=new Set(['sheets','slides','documents','pdf','artifact','planning']);
 const selected=eligible.filter(tool=>typedCategories.has(tool.function.name)&&ctx.discoveredTools?.has(tool.function.name)).slice(-4);
 if(!selected.length)return definitions;
 return definitions.map(definition=>{
  if(definition.function.name!=='toolkit')return definition;
  const schema=definition.function.parameters;const discovery=(schema.oneOf??schema.anyOf??[]).filter((branch:any)=>branch.properties?.action?.const==='discover');
  const $defs:Record<string,any>={...(schema.$defs??{})};
  const calls=selected.map((tool,index)=>{
   const prefix='gateway_'+index+'_';const rebase=(node:any):any=>Array.isArray(node)?node.map(rebase):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,value])=>[key,key==='$ref'&&typeof value==='string'&&value.startsWith('#/$defs/')?'#/$defs/'+prefix+value.slice(8):rebase(value)])):node;
   const {$defs:local,...input}=tool.function.parameters;for(const [key,value] of Object.entries(local??{}))$defs[prefix+key]=rebase(value);
   return {type:'object',properties:{action:{type:'string',const:'call'},name:{type:'string',const:tool.function.name},arguments:rebase(input)},required:['action','name','arguments'],additionalProperties:false};
  });
  const others=eligible.filter(tool=>!selected.some(item=>item.function.name===tool.function.name)).map(tool=>tool.function.name);
  const originalCall=(schema.oneOf??schema.anyOf??[]).find((branch:any)=>branch.properties?.action?.const==='call');
  const fallback=others.length&&originalCall?{...originalCall,properties:{...originalCall.properties,name:{type:'string',enum:others}}}:null;
  return {...definition,function:{...definition.function,parameters:{oneOf:[...discovery,...calls,...(fallback?[fallback]:[])],...(Object.keys($defs).length?{$defs}:{})}}};
 });
}
