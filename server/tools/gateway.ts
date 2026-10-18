import {z} from 'zod';
import {ToolError,type ToolRegistry} from './registry.ts';
import {publicToolDefinitions} from './groups.ts';
import {installedSkillRecommendations} from './discovery.ts';
import {catalogOperation,catalogOperations} from './catalog-operations.ts';
export function registerGateway(registry:ToolRegistry){registry.register({name:'toolkit',capability:'conversation',description:'Discover categorized tools by task or category name, read the returned actionable schemas, then call the category with schema-valid arguments. Relevant installed workflows are recommended on demand. Availability and permissions apply to every action.',input:z.discriminatedUnion('action',[z.object({action:z.literal('discover'),query:z.string().max(300).optional(),name:z.string().max(100).optional()}).strict(),z.object({action:z.literal('call'),name:z.string().min(1).max(100),arguments:z.record(z.string(),z.json())}).strict()]),handler:async(args,ctx)=>{
 const eligible=publicToolDefinitions(registry,ctx).filter(tool=>!['toolkit','discover_tools'].includes(tool.function.name));
 if(args.action==='discover'){
  const topic=(args.query??args.name??'').trim().toLowerCase();
  if(topic==='catalog'||topic==='capabilities')return {operations:catalogOperations(registry,ctx),tools:[],skills:[],summary:'Reference capability inventory. Automatic control operations describe agent behavior; executable operations resolve to real category actions. Read an action schema before calling it. Runtime and permission limitations are reported explicitly.'};
  if(!topic)return {summary:'Choose an exact category name to read its action schema. Dotted catalog labels such as browser.open also resolve to supported actions.',categories:eligible.map(tool=>({name:tool.function.name,description:tool.function.description.slice(0,160)})),tools:[],skills:[]};
  const operation=args.name?catalogOperation(args.name,registry,ctx):null;
  if(operation&&!operation.available)return {tools:[],skills:[],operation,summary:operation.reason};
  const words=topic.split(/\s+/).filter(Boolean);const rank=(tool:any)=>args.name?Number(tool.function.name===args.name)*1000:Number(tool.function.name===topic.replaceAll(' ','_'))*1000+words.reduce((n:number,word:string)=>n+(tool.function.name.toLowerCase().includes(word)?10:0)+(tool.function.description.toLowerCase().includes(word)?1:0),0);
  const tools=eligible.map(tool=>({tool,score:operation?Number(tool.function.name===operation.category)*1000:rank(tool)})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score).slice(0,args.name?1:4).map(item=>item.tool.function);
  return {tools,operation,skills:await installedSkillRecommendations(ctx,topic),summary:tools.length?'Use these category schemas with toolkit(action="call",name,arguments). Load matching installed skills with skill_load before their workflow.':'No enabled matching category. Refine the query or check runtime/permissions; do not claim access.'};
 }
 if(['toolkit','discover_tools'].includes(args.name))throw new ToolError('INVALID_ARGUMENTS','Specify an actual category or offered tool; recursive gateway calls are not allowed');
 if(!eligible.some(tool=>tool.function.name===args.name))throw new ToolError('TOOL_DISABLED','Tool unavailable or not permitted in this conversation: '+args.name);
 const {executeGroupedLeaf}=await import('./groups.ts');
 return executeGroupedLeaf(registry,args.name,args.arguments,ctx);
}});}
