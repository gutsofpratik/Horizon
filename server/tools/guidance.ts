import type {Tool,ToolContext} from './registry.ts';
import {groupForLeaf,isToolGroup} from './groups.ts';
import {decideTool} from './policy.ts';
export function relatedTools(skill:any){const topic=(skill.name+' '+skill.description).toLowerCase();if(skill.id==='openclaude-skill-author')return ['skill_create','skill_update','skill_load','skills_list'];if(skill.id==='openclaude-tool-author')return ['custom_tool_create','custom_tool_list','custom_tool_delete','discover_tools'];if(/brainstorm|planning/.test(topic))return ['ask_user','planning','artifact'];if(/pdf|docx|document|co-author/.test(topic))return ['documents'];if(/spreadsheet|xlsx|excel/.test(topic))return ['sheets','chart_create'];if(/presentation|slides|powerpoint/.test(topic))return ['slides'];if(/design|artifact|frontend|playground/.test(topic))return ['artifact'];if(/research|search/.test(topic))return ['web'];if(/coding|development|debug|test/.test(topic))return ['files_read','files_patch','terminal_run','terminal_read'];return ['skills_list','skill_load','skill_read_resource'];}
export function toolGuide(tools:Iterable<Tool>,ctx:ToolContext,definitions:any[]){
 const offered=new Set(definitions.map(tool=>tool.function.name)),deferred=new Set<string>(),unavailable=new Set<string>(),lines:string[]=[];
 const settings=ctx.app.store.get('settings','main')??{};
 for(const definition of definitions){const schema=definition.function.parameters??{};const options=schema.oneOf??schema.anyOf;const required=options?options.map((option:any)=>{const branches=option.anyOf??option.oneOf??[option];return branches.map((branch:any)=>'('+((branch.required??[]).join(', ')||'none')+')').join(' OR ');}).join(' OR '):(schema.required??[]).join(', ')||'none';lines.push(definition.function.name+': Required arguments: '+required);}
 for(const tool of tools){if(isToolGroup(tool.name))continue;const name=groupForLeaf(tool.name)??tool.name;const decision=decideTool(tool,ctx,settings),reason=tool.available?.();if(!decision.allowed||reason){unavailable.add(name+': '+(decision.reason??reason));continue;}if(!offered.has(name))deferred.add(name);}
 return `Tool operating guide (native calls; exact action schemas are supplied):
${lines.join('\n')}
Available on demand (discover_tools with category names): ${[...deferred].join(', ')||'None.'}
Unavailable actions/categories: ${[...unavailable].join('; ')||'None reported.'}
Edition: ${ctx.edition??'desktop-compatible'}; screenshot vision: ${ctx.vision===false?'unsupported':ctx.vision===true?'supported':'unverified'}. ${ctx.visionUnavailableReason??''}
Call one category with action and its exact required fields. Use returned IDs and results; no invented calls or success. INVALID_ARGUMENTS: correct named fields. Stale observation: inspect again. Conflict: read current source/version. Respect permission/runtime errors. Computer screenshots require vision; panels need not be open.`;
}
