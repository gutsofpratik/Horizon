import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import type {AppContext} from '../app.ts';
import {ToolError,type ToolRegistry,type ToolContext} from './registry.ts';

const identifier=z.string().regex(/^[a-z][a-z0-9_]{0,49}$/);
const specification=z.object({
 name:z.string().regex(/^user_[a-z][a-z0-9_]{0,44}$/),
 description:z.string().trim().min(1).max(1500),
 input_format:z.enum(['json','text']).default('json'),
 allowed_callers:z.array(z.enum(['direct','programmatic','hook','replay'])).min(1).max(4).default(['direct','programmatic','hook','replay']),
 parameters:z.array(z.object({name:identifier,type:z.enum(['string','number','boolean','object','array']),description:z.string().max(300),required:z.boolean().default(true)}).strict()).max(20),
 steps:z.array(z.object({id:identifier,tool:z.string().min(1).max(100),arguments:z.record(z.string(),z.json())}).strict()).min(1).max(20),
}).strict();
const forbidden=new Set(['toolkit','discover_tools','custom_tool_create','custom_tool_delete','custom_tool_list','skill_create','skill_update']);
const unsafe=new Set(['__proto__','constructor','prototype']);

function resolve(value:any,input:any,results:Map<string,any>,depth=0):any{
 if(depth>30)throw new ToolError('INVALID_ARGUMENTS','Workflow arguments are too deeply nested');
 if(Array.isArray(value))return value.map(item=>resolve(item,input,results,depth+1));
 if(!value||typeof value!=='object')return value;
 if('$input' in value){
  if(Object.keys(value).length!==1||typeof value.$input!=='string'||!Object.hasOwn(input,value.$input))throw new ToolError('INVALID_ARGUMENTS','Unknown input reference '+String(value.$input));
  return input[value.$input];
 }
 if('$step' in value){
  if(Object.keys(value).some(key=>!['$step','path'].includes(key))||!results.has(value.$step))throw new ToolError('INVALID_ARGUMENTS','Unknown or forward step reference');
  let result=results.get(value.$step);
  if(value.path!==undefined&&typeof value.path!=='string')throw new ToolError('INVALID_ARGUMENTS','Step path must be a dotted string');
  for(const part of (value.path??'').split('.').filter(Boolean)){
   if(unsafe.has(part)||result===null||typeof result!=='object'||!Object.hasOwn(result,part))throw new ToolError('INVALID_ARGUMENTS','Missing step result path '+value.path);
   result=result[part];
  }
  return result;
 }
 return Object.fromEntries(Object.entries(value).map(([key,item])=>{
  if(unsafe.has(key))throw new ToolError('INVALID_ARGUMENTS','Unsafe object key');
  return [key,resolve(item,input,results,depth+1)];
 }));
}

export function registerCustomTools(registry:ToolRegistry,app:AppContext){
 const validate=(spec:z.infer<typeof specification>)=>{
  if(new Set(spec.parameters.map(p=>p.name)).size!==spec.parameters.length||new Set(spec.steps.map(s=>s.id)).size!==spec.steps.length)throw new ToolError('INVALID_ARGUMENTS','Parameter names and step IDs must be unique');
  for(const parameter of spec.parameters)if(unsafe.has(parameter.name))throw new ToolError('INVALID_ARGUMENTS','Unsafe parameter name');
  for(const step of spec.steps)if(forbidden.has(step.tool)||step.tool.startsWith('user_')||!registry.tools.has(step.tool))throw new ToolError('INVALID_ARGUMENTS','Steps must call an existing leaf tool, not a gateway, authoring tool or custom workflow: '+step.tool);
 };
 const install=(spec:z.infer<typeof specification>)=>{
  const shape:Record<string,z.ZodType>={};
  for(const parameter of spec.parameters){
   let schema:z.ZodType=parameter.type==='string'?z.string():parameter.type==='number'?z.number():parameter.type==='boolean'?z.boolean():parameter.type==='array'?z.array(z.json()):z.record(z.string(),z.json());
   schema=schema.describe(parameter.description);shape[parameter.name]=parameter.required?schema:schema.optional();
  }
  if(spec.input_format==='text'&&(spec.parameters.length!==1||spec.parameters[0].name!=='input'||spec.parameters[0].type!=='string'))throw new ToolError('INVALID_ARGUMENTS','Text tools need exactly one string parameter named input');
  const objectInput=z.object(shape).strict();registry.register({name:spec.name,description:spec.description,allowedCallers:spec.allowed_callers,capability:'conversation',input:spec.input_format==='text'?z.union([z.string().max(100000),objectInput]):objectInput,inputSchema:z.toJSONSchema(objectInput),handler:async(raw,ctx)=>{const args=typeof raw==='string'?{input:raw}:raw;
   // Each leaf goes through the normal registry again: grants, memory privacy,
   // cancellation, web/desktop edition and runtime availability all still apply.
   const results=new Map<string,any>();const completed:any[]=[];const files:any[]=[];let artifact:any;
   const invocation=randomUUID();
   for(const step of spec.steps){
    if(ctx.signal.aborted)throw new ToolError('CANCELLED','Workflow cancelled',{completed_steps:completed});
    let result;
    try{
     const arguments_=resolve(step.arguments,args,results);
     result=await registry.execute({id:'workflow-'+invocation+'-'+step.id,name:step.tool,arguments:arguments_},ctx);
    }catch(error:any){throw new ToolError('WORKFLOW_STEP_FAILED',error.message,{failed_step:step.id,completed_steps:completed,cause:{code:error.code??'INVALID_ARGUMENTS',message:error.message}});}
    if(result.status!=='succeeded')throw new ToolError('WORKFLOW_STEP_FAILED','Workflow stopped at '+step.id+': '+result.error?.message,{failed_step:step.id,completed_steps:completed,cause:result.error});
    results.set(step.id,result.data);completed.push({id:step.id,tool:step.tool,summary:result.summary});files.push(...result.files);artifact=result.artifacts?.[0]??artifact;
   }
   return {output:results.get(spec.steps.at(-1)!.id),completed_steps:completed,files,...(artifact?{artifact}:{}),summary:'Completed '+spec.name};
  }});
 };
 registry.register({name:'custom_tool_create',capability:'workspace-file',description:'Create and persist a reusable typed tool workflow. First load openclaude-tool-author. Names start user_. Each step calls an existing leaf tool with normal permissions. In step arguments use {"$input":"parameter"} or {"$step":"earlier_step","path":"result_field"} for references; other JSON is literal. No recursion, gateways, code eval or permission bypass. For freeform text set input_format=text and declare exactly one string parameter named input; providers without a raw-text tool protocol use the equivalent input field wrapper. New tools are immediately discoverable and survive restart.',input:specification,handler:(args,ctx)=>{
  if(registry.tools.has(args.name)||app.store.get('custom_tools',args.name))throw new ToolError('TOOL_EXISTS','Tool name already exists; choose a new name or explicitly remove the old workflow');
  validate(args);const saved=app.store.put('custom_tools',{id:args.name,...args,createdBy:'assistant',sourceConversation:ctx.conversationId});install(args);
  return {tool:saved,summary:'Created reusable tool '+args.name};
 }});
 registry.register({name:'custom_tool_list',capability:'conversation',description:'List saved user-created tool workflows and their steps. Discover a tool by name for its input schema.',input:z.object({offset:z.number().int().min(0).default(0),limit:z.number().int().min(1).max(50).default(20)}).strict(),handler:args=>{const all=app.store.list('custom_tools');return {tools:all.slice(args.offset,args.offset+args.limit),total:all.length,next_offset:args.offset+args.limit<all.length?args.offset+args.limit:null};}});
 registry.register({name:'custom_tool_delete',capability:'workspace-file',description:'Remove a user-created tool when the user requests removal. Cannot remove built-in tools.',input:z.object({name:z.string().regex(/^user_[a-z][a-z0-9_]{0,44}$/)}).strict(),handler:args=>{if(!app.store.get('custom_tools',args.name))throw new ToolError('TOOL_NOT_FOUND','Saved custom tool not found');app.store.delete('custom_tools',args.name);registry.tools.delete(args.name);return {removed:true,name:args.name};}});
 for(const stored of app.store.list('custom_tools')){
  const {id,updatedAt,createdBy,sourceConversation,...raw}=stored;
  const parsed=specification.safeParse(raw);
  if(parsed.success){try{validate(parsed.data);install(parsed.data);}catch{/* Invalid saved workflows are not made executable. */}}
 }
}
