import {isToolGroup,groupForLeaf} from './groups.ts';
import type {Tool,ToolContext} from './registry.ts';
export type AccessMode='chat'|'cowork'|'code';
export type Capability='conversation'|'artifact'|'workspace-file'|'document-job'|'web-search'|'web-fetch'|'browser'|'terminal'|'computer'|'connector';
export function capabilityOf(tool:Tool):Capability|null{
 if(tool.capability)return tool.capability;
 if(/^terminal_/.test(tool.name)||tool.name==='skill_run_script')return 'terminal';
 if(/^browser_/.test(tool.name))return 'browser';if(/^computer_/.test(tool.name))return 'computer';
 if(/^artifact_/.test(tool.name))return 'artifact';if(/^files_/.test(tool.name))return 'workspace-file';
 if(tool.name==='web_search')return 'web-search';if(tool.name==='web_fetch')return 'web-fetch';
 if(/^(document_|pdf_|spreadsheet_|slides_|chart_|image_)/.test(tool.name))return 'document-job';
 if(/^(memory_|chat_history_|plan_|skill_|skills_)/.test(tool.name)||['calculate','project_search'].includes(tool.name))return 'conversation';return null;
}
export function decideTool(tool:Tool,ctx:ToolContext,settings:any){
 const conversation=ctx.app.store.get('conversations',ctx.conversationId)??ctx.app.ephemeral.get(ctx.conversationId);
 const run=ctx.runId?ctx.app.store.get('runs',ctx.runId):undefined;const mode:AccessMode=(run?.conversationId===ctx.conversationId?run?.mode:undefined)??conversation?.mode??ctx.mode??'chat';const capability=capabilityOf(tool);
 if(!capability)return {allowed:false,code:'TOOL_POLICY_UNCLASSIFIED',reason:'Tool has no declared capability classification'};
 if(ctx.edition==='web'&&['terminal','computer'].includes(capability))return {allowed:false,code:'EDITION_TOOL_DISABLED',reason:'Native terminal and computer control are available in OpenClaude Desktop'};
 if(settings.toolsEnabled===false||ctx.toolsEnabled===false)return {allowed:false,code:'TOOLS_DISABLED',reason:'Agent tools are disabled'};
 if(/^(memory_|chat_history_)/.test(tool.name)&&(ctx.incognito||settings.memoryEnabled===false||conversation?.useMemory===false))return {allowed:false,code:'MEMORY_DISABLED',reason:'Memory and past-chat retrieval are disabled for this conversation'};
 if(tool.name!=='toolkit'&&!isToolGroup(tool.name)&&settings.enabledToolNames&&!settings.enabledToolNames.includes(tool.name)&&!settings.enabledToolNames.includes(groupForLeaf(tool.name)??''))return {allowed:false,code:'TOOL_DISABLED',reason:'This tool is disabled in Settings'};
 if(tool.name!=='toolkit'&&!isToolGroup(tool.name)&&ctx.enabledToolNames&&!ctx.enabledToolNames.includes(tool.name)&&!ctx.enabledToolNames.includes(groupForLeaf(tool.name)??''))return {allowed:false,code:'TOOL_DISABLED',reason:'This tool is disabled for this run'};
 if(capability==='computer'&&ctx.vision===false)return {allowed:false,code:'VISION_REQUIRED',reason:ctx.visionUnavailableReason??'Computer use requires a model with screenshot vision support'};
 const taskMode=ctx.taskMode??settings.composerMode;
 if(!isToolGroup(tool.name)&&(taskMode==='browser'&&['web-search','web-fetch','computer','terminal'].includes(capability)||taskMode==='computer'&&['web-search','web-fetch','browser','terminal'].includes(capability)))return {allowed:false,code:'WORKFLOW_TOOL_REQUIRED',reason:'The user selected '+taskMode+' mode. Use the '+taskMode+' category for this interaction instead of '+capability+'. Discover its actions with toolkit if needed. If unavailable, explain the actual limitation; do not substitute another interaction channel.'};
 if(taskMode==='plan'&&!isToolGroup(tool.name)&&!['conversation','web-search','web-fetch'].includes(capability)&&!/^artifact_|^files_(read|list|search)$|^browser_(snapshot|screenshot|tabs|find)$/.test(tool.name))return {allowed:false,code:'PLAN_MODE_READ_ONLY',reason:'Plan mode permits research and planning artifacts, not execution or computer control. Switch out of Plan mode to execute.'};
 const desktop=ctx.app.ephemeral?.get('nativeBridge');
 if(capability==='browser'&&tool.name!=='browser_open_file'&&ctx.edition==='desktop'&&desktop?.kind==='tauri'&&desktop.browser&&Date.now()-desktop.updated<12000&&desktop.tools&&!desktop.tools.includes(tool.name))return {allowed:false,code:'NATIVE_TOOL_UNAVAILABLE',reason:'This tool is not implemented for the embedded desktop browser; use the available browser DOM tools or computer screenshot with a vision model'};
 if(ctx.incognito&&(['workspace-file','document-job'].includes(capability)||tool.name==='artifact_export'||tool.name==='browser_open_file'))return {allowed:false,code:'PRIVATE_FILES_UNAVAILABLE',reason:'Persistent file operations are unavailable in incognito; use a saved chat for generated downloads. Private HTML/code artifacts remain memory-only.'};
 if(capability==='web-search'&&(settings.webSearchEnabled===false||conversation?.webSearchEnabled===false||ctx.webSearchEnabled===false))return {allowed:false,code:'SEARCH_DISABLED',reason:'Web search is turned off'};
 if(capability==='artifact'&&settings.artifactsEnabled===false)return {allowed:false,code:'ARTIFACTS_DISABLED',reason:'Artifacts are turned off'};
 if(capability==='document-job'&&settings.documentJobsEnabled===false)return {allowed:false,code:'DOCUMENT_JOBS_DISABLED',reason:'File execution is turned off'};
 return {allowed:true};
}
