import {planningLocked,planGate} from '../agent/plan-approval.ts';
import {z} from 'zod';
import type {ToolContext,ToolRegistry} from './registry.ts';
import {decideTool} from './policy.ts';
import {groupForLeaf,isToolGroup} from './groups.ts';

export const DIRECT_TOOL_POLICY=`Tool use: call the offered function directly with its named fields. Do not wrap it in toolkit, name, arguments, or an extra action unless that function's own schema requires action. The application selects task-relevant tools and loads creation skills automatically.
Use the exact schemas already supplied. Do not discover or load a skill again just to start. discover_tools is only for a missing operation, not preparation for every call.
Excel: spreadsheet_create → spreadsheet_edit for design → spreadsheet_inspect → return the final XLSX. PDF/Word: document_create with format and blocks → return the real file. Presentations: slides_create → slides_inspect/edit when needed → return the PPTX.
Visual roadmap, diagram, interactive plan, HTML or visualization: use artifact_save with complete source. It creates or publishes the artifact in one call; the app handles publishing. To revise, artifact_read first, then artifact_save with the same artifact_id and returned expected_version. Do not start a draft lifecycle for ordinary artifacts.
Approval planning: ask essential questions with ask_user, then plan_create. Wait for its user_approval result from the button before executing. Use plan_update for the approved to-do tasks. A normal request for a visual plan is an artifact; explicit Plan mode retains its approval gate.
Coding: inspect actual files, then write/patch them and run the appropriate command if terminal access is available. Read terminal job output to completion. Browser: open, inspect returned references, then click/fill/key/scroll. Computer: inspect a screenshot before input. Goals: use the goal tool only for the user's explicitly requested persistent objective.
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
 file:['files_list','files_read','files_write','files_patch','files_search','files_versions','files_compare_versions','files_revert','tool_output_read'],
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
};
export function directToolCatalog(registry:ToolRegistry,ctx:ToolContext){
 const settings=ctx.app.store.get('settings','main')??{};
 return [...registry.tools.values()].filter(tool=>tool.name!=='toolkit'&&!isToolGroup(tool.name)&&decideTool(tool,ctx,settings).allowed&&!tool.available?.()).map(tool=>({type:'function',function:{name:tool.name,description:tool.description,parameters:tool.inputSchema??z.toJSONSchema(tool.input)}}));
}
export function taskToolProfile(request:string,taskMode?:string){
 if(taskMode==='plan')return ['planning'];if(taskMode==='goal')return ['goal','planning'];if(taskMode==='browser')return ['browser'];if(taskMode==='computer')return ['computer'];
 const names:string[]=[];const add=(name:string)=>{if(!names.includes(name))names.push(name);};
 if(taskMode==='excel'||/\b(excel|xlsx|spreadsheet|balance\s*sheet|workbook)\b/i.test(request))add('sheets');
 if(taskMode==='pdf'||/\bpdf\b/i.test(request))add('pdf');
 if(['document','documents'].includes(taskMode??'')||/\b(docx|word document|word file|create (?:a |an |the )?document|write (?:a |an |the )?document)\b/i.test(request))add('documents');
 if(['presentation','slides'].includes(taskMode??'')||/\b(presentation|slides|pptx|powerpoint)\b/i.test(request))add('slides');
 if(/\b(artifact|visuali[sz]e|visuali[sz]ation|roadmap|diagram|flowchart|html|svg|interactive|mockup|infographic)\b/i.test(request)||taskMode==='sketch')add('artifact');
 if(/\b(code|coding|debug|repository|implement|function|bug|compile|terminal|shell|script|server|package|build app)\b/i.test(request)){add('file');add('shell');}
 if(/\b(git|commit|branch|pull request)\b/i.test(request))add('git');
 if(/\b(browser|browse|navigate|webpage|click|scroll)\b|https?:\/\//i.test(request))add('browser');
 if(/\b(computer|desktop|screenshot)\b/i.test(request))add('computer');
 if(/\b(search|research|latest|sources|look up)\b/i.test(request))add('web');
 if(/\b(python|notebook|interpreter)\b/i.test(request))add('python');
 if(/\b(csv|dataset|aggregate|data analysis)\b/i.test(request))add('data');
 if(/\b(remember|memory|forget)\b/i.test(request))add('memory');
 if(/\b(goal|autonomous)\b/i.test(request))add('goal');
 if(/\b(schedule|remind|tomorrow|recurring|clock|current time)\b/i.test(request))add('schedule');
 if(/\b(queue|queued|follow.up)\b/i.test(request))add('queue');
 if(/\b(webhook|callback)\b/i.test(request))add('webhook');
 if(/\b(mcp|connector|integration)\b/i.test(request))add('mcp');
 if(/\b(http|rest api|endpoint)\b/i.test(request))add('http');
 if(/\b(agent|delegate|parallel)\b/i.test(request))add('agent');
 if(/\b(skill|skills)\b/i.test(request))add('skills');
 if(!names.length&&/\b(plan|design|create|make|build|draw)\b/i.test(request))add('artifact');
 return names;
}
export function continuationRequest(messages:any[],request:string){
 if(!/^\s*(?:continue|go on|try again|again|retry|fix (?:it|that|this)|change (?:it|that)|do it|yes|yeah|ok(?:ay|ie)?|proceed|make it better)[.!?\s]*$/i.test(request))return request;
 const earlier=messages.filter(message=>message.role==='user').slice(0,-1).reverse().slice(0,8).find(message=>taskToolProfile(message.content??'').length);
 return earlier?String(earlier.content)+'\nFollow-up: '+request:request;
}
export function modelToolDefinitions(registry:ToolRegistry,ctx:ToolContext,request:string){
 const catalog=directToolCatalog(registry,ctx);const byName=new Map(catalog.map(tool=>[tool.function.name,tool]));const selected=new Set<string>();
 const add=(name:string)=>{if(byName.has(name))selected.add(name);};
 // Stable order: the requested work first, then clarification/discovery support.
 const mode=ctx.taskMode==='plan'&&!planningLocked(ctx,ctx.app.store.get('settings','main')??{})?'chat':ctx.taskMode;
 for(const profile of taskToolProfile(request,mode))for(const name of profiles[profile]??[])add(name);
 if(planGate(ctx.app,ctx.conversationId)?.approvedRunId===ctx.runId)for(const name of ['plan_read','plan_update'])add(name);
 const conversation=ctx.app.store.get('conversations',ctx.conversationId)??ctx.app.ephemeral.get(ctx.conversationId);if(conversation?.activeDraftId)for(const name of ['artifact_draft_read','artifact_draft_resume','artifact_draft_write','artifact_draft_finish'])add(name);
 for(const name of ['ask_user','discover_tools'])add(name);
 for(const name of ctx.discoveredTools??[]){if(byName.has(name))add(name);else for(const leaf of profiles[name]??[])add(leaf);}
 if(selected.size<=3)for(const name of ['conversation_search','conversation_read','runtime_capabilities'])add(name);
 // Explicit discoveries remain callable even when a broad task uses its budget.
 const explicit=[...(ctx.discoveredTools??[])].filter(name=>byName.has(name));
 const support=['ask_user','discover_tools'].filter(name=>byName.has(name));const ordered=[...new Set([...explicit,...selected])].filter(name=>!support.includes(name));return [...ordered.slice(0,10),...support].map(name=>byName.get(name)!);
}
export function directDiscoveryMatches(registry:ToolRegistry,ctx:ToolContext,query:string,names:string[]){
 const catalog=directToolCatalog(registry,ctx);const topic=query.toLowerCase();const words=topic.split(/\W+/).filter(word=>word.length>2);
 const requested=new Set(names);const categoryNames=new Set(taskToolProfile(query));for(const name of names)if(profiles[name])categoryNames.add(name);
 const preferred=new Set([...categoryNames].flatMap(name=>profiles[name]??[]));
 return catalog.map(tool=>({tool,score:requested.has(tool.function.name)?1000:preferred.has(tool.function.name)?500:words.reduce((sum,word)=>sum+(tool.function.name.includes(word)?20:0)+(tool.function.description.toLowerCase().includes(word)?1:0),0)})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score).slice(0,8).map(item=>item.tool);
}
