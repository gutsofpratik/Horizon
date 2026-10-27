import {scopeAllows} from './task-routing.ts';
import {planningLocked,isPlanReadTool} from '../agent/plan-approval.ts';
import {isToolGroup,groupForLeaf} from './groups.ts';
import type {Tool,ToolContext} from './registry.ts';
export type AccessMode='chat'|'cowork'|'code';
export type Capability='conversation'|'artifact'|'workspace-file'|'document-job'|'web-search'|'web-fetch'|'browser'|'terminal'|'computer'|'connector';
export function capabilityOf(tool:Tool):Capability|null{
 if(tool.capability)return tool.capability;
 if(/^terminal_/.test(tool.name)||tool.name==='skill_run_script')return 'terminal';
 if(/^browser_/.test(tool.name))return 'browser';if(/^computer_/.test(tool.name))return 'computer';
 if(/^artifact_/.test(tool.name))return 'artifact';if(/^(files_|directory_|archive_)/.test(tool.name))return 'workspace-file';
 if(tool.name==='web_search'||tool.name==='web_search_documents')return 'web-search';if(tool.name==='web_fetch')return 'web-fetch';
 if(/^(document_|pdf_|spreadsheet_|slides_|chart_|image_)/.test(tool.name))return 'document-job';
 if(/^(memory_|chat_history_|plan_|skill_|skills_)/.test(tool.name)||['calculate','project_search'].includes(tool.name))return 'conversation';return null;
}
export function requiresComputerVision(name:string){return name.startsWith('computer_')&&!/^computer_(?:windows$|focus_window$|open_application$|clipboard_|window_|ui_)/.test(name);}
export function executionEnvironmentBlocker(ctx:ToolContext){
 if(ctx.executionEnvironmentId){
  const selected=ctx.app.store.get('execution_environments',ctx.executionEnvironmentId);
  if(!selected)return {allowed:false,code:'ENVIRONMENT_NOT_FOUND',reason:'The selected isolated execution environment was removed. Choose an existing environment in Settings; no host or Docker fallback was attempted.'};
  if(!ctx.app.ephemeral.get('executionEnvironments'))return {allowed:false,code:'ENVIRONMENT_UNAVAILABLE',reason:'The selected isolated worker '+selected.name+' has no connected execution service. Reconnect it in Settings; no fallback was attempted.'};
  return;
 }
 if(!ctx.app.runtime?.ready)return {allowed:false,code:'EXECUTION_ENVIRONMENT_UNAVAILABLE',reason:'No ready isolated execution environment is selected. Connect an authenticated execution worker in Settings or explicitly prepare the optional sandbox, then retry this operation once. Local Office/PDF and native terminal/computer services are separate; no Docker startup or host execution was attempted.'};
}
export function decideTool(tool:Tool,ctx:ToolContext,settings:any){
 const teamChat=ctx.app.store.get('conversations',ctx.conversationId);
 if(teamChat?.teamId&&!isToolGroup(tool.name)&&tool.name!=='toolkit'){
  const team=ctx.app.store.get('teams',teamChat.teamId),task=ctx.app.store.list('team_tasks').find(t=>t.conversationId===ctx.conversationId&&['dispatching','running'].includes(t.status));
  if(!team||team.status!=='running'||!task)return {allowed:false,code:'TEAM_PAUSED',reason:'Team execution is paused or its task is no longer active'};
  if(task.readOnly&&!isPlanReadTool(tool.name)&&tool.name!=='team_read')return {allowed:false,code:'TEAM_READ_ONLY',reason:'This member task is authorized for read-only work'};
 }
 if(ctx.remoteGrantId){const grant=ctx.app.store.get('remote_grants',ctx.remoteGrantId);if(!grant||grant.revoked||Date.parse(grant.expiresAt)<Date.now())return {allowed:false,code:'REMOTE_GRANT_REVOKED',reason:'Remote device permission expired or was revoked'};if(tool.name!=='toolkit'&&tool.name!=='discover_tools'&&!isToolGroup(tool.name)&&!grant.tools?.includes(tool.name)&&!grant.tools?.includes(groupForLeaf(tool.name)??''))return {allowed:false,code:'REMOTE_TOOL_DISABLED',reason:'This tool is outside the paired device grant'};}const conversation=ctx.app.store.get('conversations',ctx.conversationId)??ctx.app.ephemeral.get(ctx.conversationId);
 const run=ctx.runId?ctx.app.store.get('runs',ctx.runId):undefined;const mode:AccessMode=(run?.conversationId===ctx.conversationId?run?.mode:undefined)??conversation?.mode??ctx.mode??'chat';const capability=capabilityOf(tool);
 if(!capability)return {allowed:false,code:'TOOL_POLICY_UNCLASSIFIED',reason:'Tool has no declared capability classification'};
 if(ctx.edition==='web'&&['terminal','computer'].includes(capability))return {allowed:false,code:'EDITION_TOOL_DISABLED',reason:'Native terminal and computer control are available in Horizon Desktop'};
 if(settings.toolsEnabled===false||ctx.toolsEnabled===false)return {allowed:false,code:'TOOLS_DISABLED',reason:'Agent tools are disabled'};
 if(['python_session','programmatic_tools'].includes(tool.name)){const blocker=executionEnvironmentBlocker(ctx);if(blocker)return blocker;}
 const assistant=conversation?.assistantId?ctx.app.store.get('assistants',conversation.assistantId):undefined;
 if(tool.name!=='toolkit'&&!isToolGroup(tool.name)&&assistant?.toolNames&&!assistant.toolNames.includes(tool.name)&&!assistant.toolNames.includes(groupForLeaf(tool.name)??''))return {allowed:false,code:'ASSISTANT_TOOL_DISABLED',reason:'This tool is outside the selected assistant’s tool restrictions'};
 if(/^(memory_|chat_history_)/.test(tool.name)&&(ctx.incognito||settings.memoryEnabled===false||conversation?.useMemory===false))return {allowed:false,code:'MEMORY_DISABLED',reason:'Memory and past-chat retrieval are disabled for this conversation'};
 if(tool.name!=='toolkit'&&!isToolGroup(tool.name)&&settings.enabledToolNames&&!settings.enabledToolNames.includes(tool.name)&&!settings.enabledToolNames.includes(groupForLeaf(tool.name)??''))return {allowed:false,code:'TOOL_DISABLED',reason:'This tool is disabled in Settings'};
 if(tool.name!=='toolkit'&&!isToolGroup(tool.name)&&ctx.enabledToolNames&&!ctx.enabledToolNames.includes(tool.name)&&!ctx.enabledToolNames.includes(groupForLeaf(tool.name)??''))return {allowed:false,code:'TOOL_DISABLED',reason:'This tool is disabled for this run'};
 if(capability==='computer'&&requiresComputerVision(tool.name)&&ctx.vision===false)return {allowed:false,code:'VISION_REQUIRED',reason:ctx.visionUnavailableReason??'Computer use requires a model with screenshot vision support'};
 const taskMode=ctx.taskMode??settings.composerMode;
 if(!isToolGroup(tool.name)&&(taskMode==='browser'&&['web-search','web-fetch','computer','terminal'].includes(capability)||taskMode==='computer'&&['web-search','web-fetch','browser','terminal'].includes(capability)))return {allowed:false,code:'WORKFLOW_TOOL_REQUIRED',reason:'The user selected '+taskMode+' mode. Use the '+taskMode+' category for this interaction instead of '+capability+'. Discover its actions with toolkit if needed. If unavailable, explain the actual limitation; do not substitute another interaction channel.'};
 if(!scopeAllows(tool.name,ctx))return {allowed:false,code:'TASK_TOOL_OUT_OF_SCOPE',reason:'This tool is outside the current user task. Use the available task tools; ask the user before starting unrelated work.'};
 if(planningLocked(ctx,settings)&&!isToolGroup(tool.name)&&!isPlanReadTool(tool.name))return {allowed:false,code:'PLAN_APPROVAL_REQUIRED',reason:'Read-only planning is active. Inspect relevant information, ask questions with ask_user and propose a plan with plan_create. Only the user approval button unlocks execution; chat text, Full access or another tool cannot approve the plan.'};
 const desktop=ctx.app.ephemeral?.get('nativeBridge');
 if(!ctx.executionEnvironmentId&&capability==='browser'&&tool.name!=='browser_open_file'&&ctx.edition==='desktop'&&desktop?.kind==='tauri'&&desktop.browser&&Date.now()-desktop.updated<12000&&desktop.tools&&!desktop.tools.includes(tool.name))return {allowed:false,code:'NATIVE_TOOL_UNAVAILABLE',reason:'This tool is not implemented for the embedded desktop browser; use the available browser DOM tools or computer screenshot with a vision model'};
 if(ctx.incognito&&(['workspace-file','document-job'].includes(capability)||tool.name==='artifact_export'||['browser_open_file','browser_upload'].includes(tool.name)))return {allowed:false,code:'PRIVATE_FILES_UNAVAILABLE',reason:'Persistent file operations are unavailable in incognito; use a saved chat for generated downloads. Private HTML/code artifacts remain memory-only.'};
 if(capability==='web-search'&&(settings.webSearchEnabled===false||conversation?.webSearchEnabled===false||ctx.webSearchEnabled===false))return {allowed:false,code:'SEARCH_DISABLED',reason:'Web search is turned off'};
 if(capability==='artifact'&&settings.artifactsEnabled===false)return {allowed:false,code:'ARTIFACTS_DISABLED',reason:'Artifacts are turned off'};
 if(capability==='document-job'&&settings.documentJobsEnabled===false)return {allowed:false,code:'DOCUMENT_JOBS_DISABLED',reason:'File execution is turned off'};
 return {allowed:true};
}
