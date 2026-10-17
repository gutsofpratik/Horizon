import type {Tool,ToolContext} from './registry.ts';import {decideTool} from './policy.ts';import {z} from 'zod';
export function relatedTools(skill:any){const topic=(skill.name+' '+skill.description).toLowerCase();if(skill.id==='openclaude-skill-author')return ['skill_create','skill_update','skill_load','skills_list'];if(skill.id==='openclaude-tool-author')return ['custom_tool_create','custom_tool_list','custom_tool_delete','discover_tools'];if(/brainstorm|planning/.test(topic))return ['ask_user','plan_create','plan_read','plan_update','artifact_create'];if(/pdf|docx|document|co-author/.test(topic))return ['document_create','document_extract'];if(/spreadsheet|xlsx|excel/.test(topic))return ['spreadsheet_create','spreadsheet_inspect','chart_create'];if(/presentation|slides|powerpoint/.test(topic))return ['slides_create'];if(/design|artifact|frontend|playground/.test(topic))return ['artifact_draft_start','artifact_draft_write','artifact_draft_finish','artifact_read','artifact_patch'];if(/research|search/.test(topic))return ['web_search','web_fetch'];if(/coding|development|debug|test/.test(topic))return ['files_read','files_patch','terminal_run','terminal_read'];return ['skills_list','skill_load','skill_read_resource'];}
export function toolGuide(tools:Iterable<Tool>,ctx:ToolContext,definitions:any[]){
 const offered=new Set(definitions.map(tool=>tool.function.name)),lines:string[]=[],deferred:string[]=[],unavailable:string[]=[];
 const settings=ctx.app.store.get('settings','main')??{};
 for(const tool of tools){const decision=decideTool(tool,ctx,settings),reason=tool.available?.();if(!decision.allowed||reason){unavailable.push(tool.name+': '+(decision.reason??reason));continue;}
  if(!offered.has(tool.name)){deferred.push(tool.name+':');continue;}
  const schema:any=tool.inputSchema??z.toJSONSchema(tool.input),alternatives=schema.anyOf??schema.oneOf;
  const required=alternatives?alternatives.map((option:any)=>'('+((option.required??[]).join(', ')||'none')+')').join(' OR '):(schema.required??[]).join(', ')||'none';
  lines.push(tool.name+': Required arguments: '+required+(tool.requires?'. '+tool.requires:''));
 }
 return `Tool operating guide (native calls; exact types/options are in the offered schemas):
${lines.join('\n')}
Available on demand (discover_tools with exact names): ${deferred.join(', ')||'None.'}
Unavailable: ${unavailable.join('; ')||'None reported.'}
Edition: ${ctx.edition??'desktop-compatible'}; screenshot vision: ${ctx.vision===false?'unsupported':ctx.vision===true?'supported':'unverified'}. ${ctx.visionUnavailableReason??''}
Use returned IDs and results; no invented calls or success. INVALID_ARGUMENTS: correct named fields. MESSAGE_NOT_FOUND: conversation_search for actual IDs. Stale snapshot: inspect again. Conflict: read current source/version. Runtime or permission unavailable: explain the actual reason. computer_vision is not a tool; computer_screenshot requires vision. Tool availability does not depend on whether its panel is open.`;
}
