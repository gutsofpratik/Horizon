import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {ToolError,type ToolRegistry,type ToolContext} from './registry.ts';

const families:Record<string,string>={retrieval:'Index registered workspace text and perform configured hybrid semantic retrieval with source references.',python:'Persistent sandboxed Python sessions with logs, plots and downloadable outputs.',image:'Generate/edit images with a configured provider or transform existing workspace images.',lifecycle:'Inspect and manage explicitly requested OpenClaude lifecycle hooks with inherited permissions.',workflow:'Record explicit workflows, inspect steps and replay through normal permissions with fresh interactive observations.',api:'Parse JSON responses and validate bounded schemas without network execution.',trigger:'Create bounded user-requested event tasks for authorized webhooks or run completion, evaluate conditions and inspect status.',notification:'Deliver completion or attention notifications to the in-app inbox; no external messaging.',mcp:'Discover and call tools or read resources on saved connected MCP servers. User authorization and underlying tool permissions apply.',http:'Call public HTTP APIs saved by the user. Discover connections first; remote writes require approval.',schedule:'Create, list, update or cancel a future task while OpenClaude is running. Requires a saved chat and an unambiguous time.',queue:'Queue, list or cancel follow-up messages in this chat; queued work starts after the current response.',webhook:'Use saved authorized webhook integrations, inspect delivery status and read incoming events. No arbitrary destinations.',shell:'Run commands and read or stop jobs in the granted desktop terminal. Read job status before claiming success.',data:'Read, write, filter, sort and aggregate bounded CSV or JSON files in the workspace.',file:'Workspace files: list, read, write, append, copy, move, delete, compare, search and inspect. All paths are scoped to this chat or project.',directory:'Workspace directories: create, list, copy, move or delete after checking the bounded tree.',archive:'Create or extract bounded ZIP archives in the workspace.',git:'Structured Git and pull-request actions in the workspace. Destructive and remote actions require user authorization and approval.',agent:'Start isolated child agents for independent work, inspect their status and results, follow up or cancel. At most two active children per parent and six per tree, up to three child levels.',artifact:'Artifacts: create reusable source; read before update/patch to preserve the same ID and current version/hash. Draft substantial source with draft_start, write and finish.',browser:'Embedded browser: open HTTP(S) sites or existing files, inspect snapshots, then interact using actual tab IDs and observed references. tabs uses operation=list/select/close.',computer:'Computer control: screenshot first, inspect its actual image, then use current screen_id and screenshot coordinates. Actions invalidate prior observations.',web:'Web: search for current sources or fetch a public page; cite actual returned URLs.',documents:'Generate real PDF/DOCX documents or extract registered files. Check returned files before claiming completion.',pdf:'Inspect or edit real PDF files using registered file IDs and return actual files.',sheets:'Create real XLSX spreadsheets or inspect registered workbooks.',slides:'Create real PowerPoint presentations.',planning:'Create, read and update visible execution plans.'};
export function groupForLeaf(name:string):string|undefined {
 for(const [prefix,group] of [['retrieval_','retrieval'],['python_','python'],['image_','image'],['lifecycle_','lifecycle'],['workflow_','workflow'],['api_','api'],['trigger_','trigger'],['notification_','notification'],['mcp_','mcp'],['http_','http'],['schedule_','schedule'],['message_queue_','queue'],['webhook_','webhook'],['terminal_','shell'],['shell_','shell'],['data_','data'],['files_','file'],['directory_','directory'],['archive_','archive'],['git_','git'],['agent_','agent'],['artifact_','artifact'],['browser_','browser'],['computer_','computer'],['web_','web'],['document_','documents'],['pdf_','pdf'],['spreadsheet_','sheets'],['slides_','slides'],['plan_','planning']])if(name.startsWith(prefix))return group;
}
export const isGroupedLeaf=(name:string)=>!!groupForLeaf(name);
export const isToolGroup=(name:string)=>Object.hasOwn(families,name);
export function groupAction(name:string){const group=groupForLeaf(name);if(!group)return undefined;const action=name.slice(name.indexOf('_')+1);return group==='artifact'&&action==='draft_write'?'write':group==='artifact'&&action==='draft_finish'?'finish':action;}
export const groupLeafNames=(name:string,registry:ToolRegistry)=>[...registry.tools.keys()].filter(leaf=>groupForLeaf(leaf)===name);
// A leaf such as browser_tabs already has an action argument. Its inner action
// becomes operation; action remains the single public family discriminator.
function leafArguments(args:any,leafSchema:any){const {action,...rest}=args;if(leafSchema.properties?.action){rest.action=rest.operation;delete rest.operation;}return rest;}
function branches(schema:any):any[]{return schema.oneOf??schema.anyOf??[schema];}
function actionSchema(schema:any,action:string,description:string):any {
 const definitions=schema.$defs??{};const rename=(value:any):any=>{if(Array.isArray(value))return value.map(rename);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==='$ref'&&typeof item==='string'&&item.startsWith('#/$defs/')?'#/$defs/'+action+'_'+item.slice(8):rename(item)]));return value;};schema=rename(schema);const renamedDefinitions=Object.fromEntries(Object.entries(definitions).map(([key,item])=>[action+'_'+key,rename(item)]));
 const options=branches(schema).map((branch:any)=>{const properties={...branch.properties};const required=[...(branch.required??[])];if(properties.action){properties.operation=properties.action;delete properties.action;const index=required.indexOf('action');if(index>=0)required[index]='operation';}return {...branch,description,properties:{action:{type:'string',const:action},...properties},required:['action',...required],additionalProperties:false};});
 return {...(options.length===1?options[0]:{anyOf:options}),...(Object.keys(renamedDefinitions).length?{$defs:renamedDefinitions}:{})};
}
function flattenedBranches(schema:any):any[]{const alternatives=schema.oneOf??schema.anyOf;return alternatives?alternatives.flatMap(flattenedBranches):[schema];}
/** Some native model templates print only root properties. Keep those usable
 * without weakening the per-action branches that enforce exact field sets. */
function categorySchema(oneOf:any[]){
 const definitions:Record<string,any>={};oneOf=oneOf.map(branch=>{const {$defs,...rest}=branch;Object.assign(definitions,$defs??{});return rest;});
 const variants=new Map<string,Map<string,any>>();const actions=new Map<string,string>();
 for(const branch of oneOf.flatMap(flattenedBranches)){
  const action=branch.properties?.action?.const;if(typeof action==='string')actions.set(action,branch.description??'');
  for(const [name,schema] of Object.entries(branch.properties??{})){
   if(name==='action')continue;const schemas=variants.get(name)??new Map();schemas.set(JSON.stringify(schema),schema);variants.set(name,schemas);
  }
 }
 const properties:Record<string,any>={action:{type:'string',enum:[...actions.keys()],description:[...actions].map(([action,description])=>action+': '+description).join('\n')}};
 for(const [name,schemas] of variants){const alternatives=[...schemas.values()];properties[name]=alternatives.length===1?alternatives[0]:{anyOf:alternatives};}
 return {type:'object',properties,required:['action'],additionalProperties:false,oneOf,...(Object.keys(definitions).length?{$defs:definitions}:{})};
}
const generatedDefinitions=new WeakSet<object>();
/** Convert already policy/availability-filtered leaf definitions to public schemas. */
export function categoryDefinitions(definitions:any[]){
 const result=definitions.filter(tool=>!isGroupedLeaf(tool.function.name)&&!isToolGroup(tool.function.name));
 for(const [name,description] of Object.entries(families)){
  const leaves=definitions.filter(tool=>groupForLeaf(tool.function.name)===name);
  // This makes the function idempotent when a caller already received categories.
  if(!leaves.length){const existing=definitions.find(tool=>tool.function.name===name&&generatedDefinitions.has(tool));if(existing)result.push(existing);continue;}
  const definition={type:'function',function:{name,description,parameters:categorySchema(leaves.map(tool=>actionSchema(tool.function.parameters,groupAction(tool.function.name)!,tool.function.description)))}};generatedDefinitions.add(definition);result.push(definition);
 }
 return result;
}
export function publicToolDefinitions(registry:ToolRegistry,ctx:ToolContext){return categoryDefinitions(registry.definitions(ctx.enabledToolNames,ctx.vision,ctx));}
export async function executeGroupedLeaf(registry:ToolRegistry,name:string,args:any,ctx:ToolContext){
 const result=await registry.execute({id:'category-'+randomUUID(),name,arguments:args},ctx);
 if(result.status!=='succeeded')throw new ToolError(result.error?.code??'TOOL_FAILED',result.error?.message??result.summary,{...result.data,called_tool:result.data?.called_tool??name,activity_call_id:result.data?.activity_call_id??result.call_id});
 return {...result.data,called_tool:result.data?.called_tool??name,activity_call_id:result.data?.activity_call_id??result.call_id,summary:result.summary,files:result.files,...(result.artifacts?.[0]?{artifact:result.artifacts[0]}:{})};
}
export function registerToolGroups(registry:ToolRegistry){
 for(const [name,description] of Object.entries(families)){
  const leaves=groupLeafNames(name,registry);if(!leaves.length)continue;
  const resolve=(action:unknown)=>leaves.find(leaf=>groupAction(leaf)===action||leaf===action);
  const input=z.any().superRefine((args,ctx)=>{if(!args||typeof args!=='object'||Array.isArray(args)){ctx.addIssue({code:'custom',message:'Expected an object with action'});return;}const leaf=resolve(args.action);if(!leaf){ctx.addIssue({code:'custom',path:['action'],message:'Expected one of '+leaves.map(groupAction).join(', ')});return;}const tool=registry.tools.get(leaf)!;const schema=tool.inputSchema??z.toJSONSchema(tool.input);const parsed=tool.input.safeParse(leafArguments(args,schema));if(!parsed.success)for(const issue of parsed.error.issues)ctx.addIssue({code:'custom',path:issue.path,message:issue.message});});
  const definitions=leaves.map(leaf=>{const tool=registry.tools.get(leaf)!;return {function:{name:leaf,description:tool.description,parameters:tool.inputSchema??z.toJSONSchema(tool.input)}};});
  registry.register({name,description,capability:'conversation',input,inputSchema:categoryDefinitions(definitions)[0].function.parameters,handler:(args,ctx)=>{const leaf=resolve(args.action)!;const tool=registry.tools.get(leaf)!;return executeGroupedLeaf(registry,leaf,leafArguments(args,tool.inputSchema??z.toJSONSchema(tool.input)),ctx);}});
 }
}



