import {randomUUID} from 'node:crypto';import {z} from 'zod';import {ToolError,type ToolRegistry} from './registry.ts';
export function registerGateway(registry:ToolRegistry){registry.register({name:'toolkit',capability:'conversation',description:'Single gateway to OpenClaude tools. First discover a task keyword or exact tool name to read its instructions/schema. Then call that name with schema-valid arguments. Only enabled tools are usable. Discovery does not execute anything; tools and skills are available on demand.',input:z.discriminatedUnion('action',[z.object({action:z.literal('discover'),query:z.string().max(300).optional(),name:z.string().max(100).optional()}).strict(),z.object({action:z.literal('call'),name:z.string().min(1).max(100),arguments:z.record(z.string(),z.json())}).strict()]),handler:async(args,ctx)=>{
 const eligible=registry.definitions(ctx.enabledToolNames,ctx.vision,ctx).filter(tool=>!['toolkit','discover_tools'].includes(tool.function.name));
 if(args.action==='discover'){
  const topic=(args.query??args.name??'').trim().toLowerCase();
  if(!topic)return {summary:'Describe the task in query, such as browser open, artifact edit, PDF, memory, or terminal. Use name for an exact tool.',tools:[]};
  const words=topic.split(/\s+/).filter(Boolean);const rank=(tool:any)=>args.name?Number(tool.function.name===args.name)*1000:Number(tool.function.name===topic.replaceAll(' ','_'))*1000+words.reduce((n:number,word:string)=>n+(tool.function.name.toLowerCase().includes(word)?10:0)+(tool.function.description.toLowerCase().includes(word)?1:0),0);
  const tools=eligible.map(tool=>({tool,score:rank(tool)})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score).slice(0,args.name?1:3).map(item=>item.tool.function);
  return {tools,summary:tools.length?'Read these schemas, then use toolkit(action="call",name,arguments). Other tools remain on demand.':'No enabled matching tool. Refine the query or check runtime/permissions; do not claim access.'};
 }
 if(!args.name||['toolkit','discover_tools'].includes(args.name))throw new ToolError('INVALID_ARGUMENTS','Specify an actual leaf tool name; recursive gateway calls are not allowed');
 if(!eligible.some(tool=>tool.function.name===args.name))throw new ToolError('TOOL_DISABLED','Tool unavailable or not permitted in this conversation: '+args.name);
 const result=await registry.execute({id:'gateway-'+randomUUID(),name:args.name,arguments:args.arguments??{}},ctx);
 if(result.status!=='succeeded')throw new ToolError(result.error?.code??'TOOL_FAILED',result.error?.message??result.summary,{...result.data,called_tool:args.name});
 return {...result.data,called_tool:args.name,activity_call_id:result.call_id,summary:result.summary,files:result.files,...(result.artifacts?.[0]?{artifact:result.artifacts[0]}:{})};
}});}
