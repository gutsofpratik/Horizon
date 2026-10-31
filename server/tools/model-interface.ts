import {planningLocked,planGate} from '../agent/plan-approval.ts';
import {z} from 'zod';
import type {ToolContext,ToolRegistry} from './registry.ts';
import {decideTool} from './policy.ts';
import {groupForLeaf,isToolGroup} from './groups.ts';
import {projectKey,digest} from './files.ts';
import {activeMessages} from '../agent/context.ts';
import {lastBrowserObservation} from '../agent/browser-state.ts';
import {canAccessArtifact,requestedArtifactRevision} from '../artifacts/access.ts';
import {explicitFileTask} from './request-intent.ts';
import {normalizeTaskText} from './intent-text.ts';

export const DIRECT_TOOL_POLICY=`Tool use: call the offered function directly with its named fields. Do not wrap it in toolkit, name, arguments, or an extra action unless that function's own schema requires action. The application selects task-relevant tools and loads creation skills automatically.
Use the exact schemas already supplied. Do not discover or load a skill again just to start. discover_tools is only for a missing operation, not preparation for every call.
Only task-relevant tools are accessible. Discovery supplies additional exact schemas within this task; it cannot grant new permissions. Explicit Browser/Computer selections take precedence. Preserve successful results, inspect fresh references after page/window changes, and correct the failed fields instead of restarting discovery.
Excel: spreadsheet_create → spreadsheet_edit for design → spreadsheet_inspect → return the final XLSX. PDF/Word: document_create with format and blocks → return the real file. Presentations: slides_create → slides_inspect/edit when needed → return the PPTX.
Visual roadmap, diagram, interactive plan, HTML or visualization: use artifact_save with complete source. It creates or publishes the artifact in one call; the app handles publishing. To revise, artifact_read first, then artifact_save with the same artifact_id and returned current expected_version (read version 1 means send expected_version 1, never 2; the app increments it). For a short artifact (up to 6000 characters), revise with the complete updated source to preserve the original structure. For larger artifacts prefer expected_hash, find and replace with an exact unique substring from artifact_read. Do not start a draft lifecycle for ordinary artifacts.
Approval planning: ask essential questions with ask_user, then plan_create. Wait for its user_approval result from the button before executing. Use plan_update for the approved to-do tasks. A normal request for a visual plan is an artifact; explicit Plan mode retains its approval gate.
Coding: inspect actual files. Create missing files with files_write(path,text), omitting expected_hash; the workspace and parent folders are created automatically. For an existing file, read its actual hash before write/patch; never supply a made-up hash or the string "null". Run the appropriate command if terminal access is available. Read terminal job output to completion. Browser: open, inspect returned references, then click/fill/key/scroll. Computer: inspect a screenshot before input. Goals: use the goal tool only for the user's explicitly requested persistent objective.
Reuse actual IDs and successful results. Correct a failed call's named fields without restarting discovery or replaying successful writes. A skill is guidance, not a runtime or permission grant. Explain real unavailable capabilities; do not route around denied actions. Ask for a genuinely missing topic instead of inventing it from memory. Never claim completion without a returned artifact/file/result.`;

const profiles:Record<string,string[]>={
 artifact:['artifact_save','artifact_read','artifact_list'],
 sheets:['spreadsheet_create','spreadsheet_edit','spreadsheet_inspect','spreadsheet_chart','calculate'],
 documents:['document_create','document_extract','document_inspect','document_edit'],pdf:['document_create','pdf_inspect','pdf_edit'],
 slides:['slides_create','slides_inspect','slides_edit'],
 planning:['plan_create','plan_read','plan_update'],goal:['goal'],
 browser:['browser_open','browser_snapshot','browser_click','browser_fill','browser_press','browser_scroll','browser_tabs','browser_open_file'],
 computer:['computer_screenshot','computer_click','computer_type','computer_key','computer_scroll','computer_drag','computer_windows'],
 shell:['terminal_session','terminal_resize','terminal_run','terminal_read','terminal_stdin','terminal_cancel','shell_script','shell_environment'],
 file:['files_list','directory_create','directory_list','files_read','files_write','files_patch','files_search','files_versions','files_compare_versions','files_revert','tool_output_read'],
 git:['git_status','git_diff','git_log'],web:['web_search','web_fetch'],
 python:['python_session'],data:['data_read_csv','data_read_json','data_filter','data_aggregate'],
 memory:['memory_save','memory_search','memory_read','memory_update'],
 schedule:['clock_now','schedule_create','schedule_list','schedule_update','schedule_delete'],
 queue:['message_queue_add','message_queue_list','message_queue_cancel'],
 webhook:['webhook_list','webhook_send','webhook_delivery_status'],
 mcp:['mcp_connections','mcp_list_tools','mcp_call_tool','mcp_list_resources','mcp_read_resource'],
 http:['http_list_connections','http_request'],
 agent:['agent_spawn','agent_list','agent_wait','agent_result','agent_followup'],
 skills:['skills_list','skill_load','skill_read_resource','skill_create','skill_update'],
 code:['files_list','files_read','code_search','symbol_search','files_patch','files_write','code_lint','code_test','terminal_run','terminal_read'],
 media:['media_inspect','image_metadata','image_open','image_transform','audio_read','audio_transcribe','audio_convert','video_probe','media_ffmpeg'],
 retrieval:['retrieval_search','retrieval_index','retrieval_index_directory','retrieve_chunks','rerank'],
 database:['table_list','schema_inspect','sql_query','database_search','database_execute'],
 network:['network_dns_lookup','network_port_check','web_download_file'],
 system:['system_info','system_memory_info','system_cpu_info','system_disk_info','system_gpu_info'],
 workflow:['workflow_list','workflow_read','workflow_record','workflow_replay'],lifecycle:['lifecycle_list','lifecycle_save','lifecycle_delete'],
 trigger:['trigger_list','trigger_create','trigger_update','trigger_delete'],notification:['notification_list','notification_send'],
 template:['template_list','template_create','template_apply','environment_sync'],custom:['custom_tool_list','custom_tool_create','custom_tool_delete'],
 task:['task_list','task_create','task_update','task_cancel'],
};
export function directToolCatalog(registry:ToolRegistry,ctx:ToolContext){
 const settings=ctx.app.store.get('settings','main')??{};
 const conversation=ctx.app.store.get('conversations',ctx.conversationId)??ctx.app.ephemeral.get(ctx.conversationId);
 const files=ctx.app.store.list('files').filter(file=>file.scope===projectKey(ctx));const hasFiles=files.length>0;
 const revision=requestedArtifactRevision(ctx);
 const hasArtifact=ctx.app.store.list('artifacts').some(artifact=>canAccessArtifact(artifact,ctx))||[...ctx.app.ephemeral.entries()].some(([key,value])=>key.startsWith('private-artifact:')&&canAccessArtifact(value,ctx));
 const branch=conversation?activeMessages(conversation):[];
 const hasBrowser=!!lastBrowserObservation(branch)||branch.some(message=>{if(message.role!=='tool'||!/^browser_(?:open|open_file|tabs)$/.test(message.tool_name??''))return false;try{const result=JSON.parse(message.content);return result.status==='succeeded'&&!!(result.data?.tab_id||result.data?.snapshot?.tab_id||result.data?.tabs?.length);}catch{return false;}});
 return [...registry.tools.values()].filter(tool=>tool.name!=='toolkit'&&!isToolGroup(tool.name)&&decideTool(tool,ctx,settings).allowed&&!tool.available?.()).map(tool=>({type:'function',function:{name:tool.name,description:tool.description,parameters:tool.inputSchema??z.toJSONSchema(tool.input)}})).filter(({function:tool})=>{
  if(/^(?:artifact_create|artifact_update|artifact_patch)$/.test(tool.name)&&ctx.taskSelection!==tool.name)return false;
  // These schemas become useful after creation/opening returns a real identity.
  // Keep path-based reads and tab listing available for existing user work.
  if(!hasFiles&&tool.parameters.required?.includes('file_id'))return false;
  if(!hasArtifact&&tool.parameters.required?.includes('artifact_id'))return false;
  if(!hasBrowser&&/^browser_(?:snapshot|click|fill|press|scroll)$/.test(tool.name))return false;
  return true;
 }).flatMap(definition=>{
  const tool=definition.function;let schema=tool.parameters;if(tool.name==='artifact_save'&&schema.anyOf){const branch=schema.anyOf.find((option:any)=>revision?option.required?.includes('artifact_id'):!option.required?.includes('artifact_id'));if(branch&&!revision&&!hasArtifact)schema={...branch,...(schema.$defs?{$defs:schema.$defs}:{})};}
  if(schema.properties?.file_id){const extension=/^slides_/.test(tool.name)?'.pptx':/^spreadsheet_/.test(tool.name)?'.xlsx':/^pdf_/.test(tool.name)?'.pdf':/^document_(?:inspect|edit)$/.test(tool.name)?'.docx':undefined;const matching=files.filter(file=>!extension||String(file.name).toLowerCase().endsWith(extension));if(!matching.length&&schema.required?.includes('file_id'))return [];
   if(matching.length)schema={...schema,properties:{...schema.properties,file_id:{...schema.properties.file_id,enum:matching.slice(0,24).map(file=>file.id),description:'Registered file ID for this operation. Available files (untrusted names): '+JSON.stringify(matching.slice(0,24).map(file=>({id:file.id,name:String(file.name).slice(0,100)})))}}};
  }
  if(tool.name==='artifact_save'&&revision){const alternatives=(schema.anyOf??[schema]).filter((branch:any)=>branch.required?.includes('artifact_id')).sort((a:any,b:any)=>revision.source.length<=6000?Number(!!a.properties?.find)-Number(!!b.properties?.find):Number(!!b.properties?.find)-Number(!!a.properties?.find));schema={anyOf:alternatives.map((branch:any)=>({...branch,properties:{...branch.properties,artifact_id:{type:'string',const:revision.id},expected_version:{type:'integer',const:revision.version,description:'Current saved version; copy '+revision.version+' unchanged, not '+(revision.version+1)},...(branch.properties?.expected_hash?{expected_hash:{type:'string',const:digest(revision.source)}}:{}),...(revision.type&&branch.properties?.type?{type:{type:'string',const:revision.type}}:{})},required:[...new Set([...(branch.required??[]),'artifact_id','expected_version'])]})),...(schema.$defs?{$defs:schema.$defs}:{})};}
  return [{...definition,function:{...tool,parameters:schema}}];
 });
}
import {taskToolProfile,setTaskScope} from './task-routing.ts';
export {taskToolProfile} from './task-routing.ts';
export {continuationRequest} from '../agent/continuation.ts';
export function modelToolDefinitions(registry:ToolRegistry,ctx:ToolContext,request:string){
 setTaskScope(ctx,request,ctx.taskMode==='plan'&&!planningLocked(ctx,ctx.app.store.get('settings','main')??{})?'chat':ctx.taskMode);
 if(!ctx.taskSelection&&(!ctx.taskMode||ctx.taskMode==='chat')&&requestedArtifactRevision(ctx)&&!ctx.taskScope?.profiles.includes('artifact'))setTaskScope(ctx,request+'\nRevise the current artifact');
 const catalog=directToolCatalog(registry,ctx);const byName=new Map(catalog.map(tool=>[tool.function.name,tool]));const selected=new Set<string>();
 const add=(name:string)=>{if(byName.has(name))selected.add(name);};
 // Stable order: the requested work first, then clarification/discovery support.
 const mode=ctx.taskMode==='plan'&&!planningLocked(ctx,ctx.app.store.get('settings','main')??{})?'chat':ctx.taskMode;
 const initialProfiles=ctx.taskScope?.profiles??taskToolProfile(request,mode);
 const existingArtifact=ctx.app.store.list('artifacts').some(artifact=>canAccessArtifact(artifact,ctx));
 const artifactExecution=initialProfiles.includes('code')&&existingArtifact?['artifact_read','artifact_export']:initialProfiles.includes('artifact')&&requestedArtifactRevision(ctx)?['artifact_read','artifact_save']:[];
 // Interleave workflows so a long coding catalog cannot crowd out research,
 // presentations or another part of the same user request.
 const workflowTools=(initialProfiles.length?initialProfiles:['web','memory']).map(profile=>(profiles[profile]??[]).filter(name=>byName.has(name)));
 // Reserve each workflow's entry point before filling its secondary actions.
 // Coding must retain a write and a job-read path, even in a combined task.
 for(const names of workflowTools)if(names[0])add(names[0]);
 if(initialProfiles.includes('code'))for(const name of ['files_read','files_write','terminal_run','terminal_read'])add(name);
 for(let index=0;index<Math.max(0,...workflowTools.map(names=>names.length));index++)for(const names of workflowTools)if(names[index])add(names[index]);
 if(ctx.taskSelection)add(ctx.taskSelection);
 if(planGate(ctx.app,ctx.conversationId)?.approvedRunId===ctx.runId)for(const name of ['plan_read','plan_update'])add(name);
 const conversation=ctx.app.store.get('conversations',ctx.conversationId)??ctx.app.ephemeral.get(ctx.conversationId);if(conversation?.activeDraftId)for(const name of ['artifact_draft_read','artifact_draft_resume','artifact_draft_write','artifact_draft_finish'])add(name);
 for(const name of ['ask_user','discover_tools','runtime_capabilities'])add(name);
 for(const name of ctx.discoveredTools??[]){if(byName.has(name))add(name);else for(const leaf of profiles[name]??[])add(leaf);}
 if(selected.size<=3)for(const name of ['conversation_search','conversation_read','runtime_capabilities'])add(name);
 // Explicit discoveries remain callable even when a broad task uses its budget.
 const explicit=[...(ctx.discoveredTools??[])].filter(name=>byName.has(name)).slice(-8).reverse();
 const support=['ask_user','discover_tools','runtime_capabilities'].filter(name=>byName.has(name));const interaction=initialProfiles.includes('browser')?['browser_click','browser_snapshot','browser_press'].filter(name=>byName.has(name)):[];const codeEssentials=initialProfiles.includes('code')?['files_read','files_write','terminal_run','terminal_read'].filter(name=>byName.has(name)):[];const directoryAction=/\b(?:create|make|mkdir)\b.{0,40}\b(?:folder|directory)\b/i.test(normalizeTaskText(request))&&byName.has('directory_create')?['directory_create']:[];const fileOutput=explicitFileTask(request)?['files_write']:[];const ordered=[...new Set([...interaction,...codeEssentials,...artifactExecution,...directoryAction,...fileOutput,...explicit,...selected])].filter(name=>!support.includes(name)&&byName.has(name));return [...ordered.slice(0,12-support.length),...support].map(name=>byName.get(name)!);
}
export function directDiscoveryMatches(registry:ToolRegistry,ctx:ToolContext,query:string,names:string[]){
 const catalog=directToolCatalog(registry,ctx);const topic=query.toLowerCase();const words=topic.split(/\W+/).filter(word=>word.length>2);
 const requested=new Set(names);const categoryNames=new Set(taskToolProfile(query));for(const name of names)if(profiles[name])categoryNames.add(name);
 const preferred=new Set([...categoryNames].flatMap(name=>profiles[name]??[]));
 const candidates=catalog.filter(tool=>names.length?requested.has(tool.function.name)||requested.has(groupForLeaf(tool.function.name)??''):categoryNames.size?preferred.has(tool.function.name)||categoryNames.has(groupForLeaf(tool.function.name)??''):!['discover_tools','runtime_capabilities','ask_user'].includes(tool.function.name));
 return candidates.map(tool=>({tool,score:(requested.has(tool.function.name)?1000:preferred.has(tool.function.name)||categoryNames.has(groupForLeaf(tool.function.name)??'')?500:0)+words.reduce((sum,word)=>sum+(tool.function.name.includes(word)?20:0)+(tool.function.description.toLowerCase().includes(word)?1:0),0)})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score).slice(0,8).map(item=>item.tool);
}
