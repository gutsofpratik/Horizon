import type {Tool,ToolContext} from './registry.ts';
import {groupForLeaf,isToolGroup} from './groups.ts';
import {decideTool} from './policy.ts';
export function relatedTools(skill:any){
 const explicit:Record<string,string[]>={
  'openclaude-tool-operation':['*'],
  'openclaude-skill-author':['skill_create','skill_update','skill_load','skills_list'],
  'openclaude-tool-author':['custom_tool_create','custom_tool_list','custom_tool_delete','discover_tools'],
  'openclaude-spreadsheet-workflow':['sheets','chart_create','data'],
  'openclaude-document-workflow':['documents','pdf'],
  'openclaude-presentation-workflow':['slides'],
  'openclaude-terminal-workflow':['shell','file','directory','git'],
  'openclaude-browser-and-computer':['browser','computer'],
  'openclaude-runtime-orchestration':['agent','programmatic_tools','discover_tools','planning','goal'],
  'openclaude-data-and-creative-workflows':['python','retrieval','documents','pdf','sheets','slides','artifact','data','image']
 };
 if(explicit[skill.id])return explicit[skill.id];
 const topic=(skill.name+' '+skill.description).toLowerCase();const tools=new Set<string>();
 for(const [pattern,names] of [
  [/brainstorm|planning/,['ask_user','planning','artifact']],
  [/pdf|docx|document|co-author/,['documents','pdf']],
  [/spreadsheet|xlsx|excel/,['sheets','chart_create','data']],
  [/presentation|slides|powerpoint/,['slides']],
  [/design|artifact|frontend|playground/,['artifact']],
  [/research|search/,['web','retrieval']],
  [/browser|computer.use/,['browser','computer']],
  [/coding|development|debug|test|terminal|shell/,['file','shell','git']]
 ] as [RegExp,string[]][])if(pattern.test(topic))for(const name of names)tools.add(name);
 return tools.size?[...tools]:['skills_list','skill_load','skill_read_resource'];
}
export function toolGuide(tools:Iterable<Tool>,ctx:ToolContext,definitions:any[]){
 const offered=new Set(definitions.map(tool=>tool.function.name)),deferred=new Set<string>(),unavailable=new Set<string>(),lines:string[]=[];
 const settings=ctx.app.store.get('settings','main')??{};
 for(const definition of definitions){const schema=definition.function.parameters??{};const options=schema.oneOf??schema.anyOf;if(options){const actions=[...new Set(options.flatMap((option:any)=>(option.anyOf??option.oneOf??[option]).map((branch:any)=>branch.properties?.action?.const).filter(Boolean)))];lines.push(definition.function.name+': Required arguments: action; actions '+actions.join(', '));}else lines.push(definition.function.name+': Required arguments: '+((schema.required??[]).join(', ')||'none'));}
 for(const tool of tools){if(isToolGroup(tool.name))continue;const name=groupForLeaf(tool.name)??tool.name;const decision=decideTool(tool,ctx,settings),reason=tool.available?.();if(!decision.allowed||reason){unavailable.add(name+': '+(decision.reason??reason));continue;}if(!offered.has(name))deferred.add(name);}
 return `Tool operating guide (native calls; exact action schemas are supplied):
${lines.join('\n')}
Available on demand (discover_tools with category names): ${[...deferred].join(', ')||'None.'}
Unavailable actions/categories: ${[...unavailable].map(reason=>reason.slice(0,160)).join('; ')||'None reported.'}
Edition: ${ctx.edition??'desktop-compatible'}; screenshot vision: ${ctx.vision===false?'unsupported':ctx.vision===true?'supported':'unverified'}. ${ctx.visionUnavailableReason??''}
Read toolkit({"action":"discover","name":"guide","query":"CATEGORY","tool_action":"ACTION"}) for a call example and prerequisites. Call one category with action and its exact required fields. Gateway arguments must be an object, never quoted JSON. Use returned IDs and results; no invented calls or success. INVALID_ARGUMENTS: correct named fields. Stale observation: inspect again. Conflict: read current source/version. Respect permission/runtime errors. Computer screenshots require vision; panels need not be open.`;
}
