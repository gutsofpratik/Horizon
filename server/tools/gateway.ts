import {z} from 'zod';
import {ToolError,type ToolRegistry} from './registry.ts';
import {publicToolDefinitions} from './groups.ts';
import {installedSkillRecommendations} from './discovery.ts';
export function registerGateway(registry:ToolRegistry){registry.register({name:'toolkit',capability:'conversation',description:'Discover categorized tools by task or category name, read the returned actionable schemas, then call the category with schema-valid arguments. Relevant installed workflows are recommended on demand. Availability and permissions apply to every action.',input:z.discriminatedUnion('action',[z.object({action:z.literal('discover'),query:z.string().max(300).optional(),name:z.string().max(100).optional()}).strict(),z.object({action:z.literal('call'),name:z.string().min(1).max(100),arguments:z.record(z.string(),z.json())}).strict()]),handler:async(args,ctx)=>{
 const eligible=publicToolDefinitions(registry,ctx).filter(tool=>!['toolkit','discover_tools'].includes(tool.function.name));
 if(args.action==='discover'){
  const topic=(args.query??args.name??'').trim().toLowerCase();
  if(!topic)return {summary:'Describe the task in query, such as browser open, artifact edit, PDF, memory, or terminal. Use name for an exact category.',tools:[],skills:[]};
  const words=topic.split(/\s+/).filter(Boolean);const rank=(tool:any)=>args.name?Number(tool.function.name===args.name)*1000:Number(tool.function.name===topic.replaceAll(' ','_'))*1000+words.reduce((n:number,word:string)=>n+(tool.function.name.toLowerCase().includes(word)?10:0)+(tool.function.description.toLowerCase().includes(word)?1:0),0);
  const tools=eligible.map(tool=>({tool,score:rank(tool)})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score).slice(0,args.name?1:4).map(item=>item.tool.function);
  return {tools,skills:await installedSkillRecommendations(ctx,topic),summary:tools.length?'Use these category schemas with toolkit(action="call",name,arguments). Load matching installed skills with skill_load before their workflow.':'No enabled matching category. Refine the query or check runtime/permissions; do not claim access.'};
 }
 if(['toolkit','discover_tools'].includes(args.name))throw new ToolError('INVALID_ARGUMENTS','Specify an actual category or offered tool; recursive gateway calls are not allowed');
 if(!eligible.some(tool=>tool.function.name===args.name))throw new ToolError('TOOL_DISABLED','Tool unavailable or not permitted in this conversation: '+args.name);
 const {executeGroupedLeaf}=await import('./groups.ts');
 return executeGroupedLeaf(registry,args.name,args.arguments,ctx);
}});}
