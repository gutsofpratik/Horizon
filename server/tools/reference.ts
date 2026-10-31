import {canonicalAlias} from '../skills/ecosystem/relationships.ts';
import {z} from 'zod';
import type {ToolRegistry,ToolContext} from './registry.ts';
import {groupForLeaf,groupAction,isToolGroup} from './groups.ts';
import {decideTool} from './policy.ts';
import {operationExamples,operationWorkflow} from './operation-workflows.ts';
import {artifactById} from '../artifacts/access.ts';
import {digest as digestForGuidance} from './files.ts';

export function normalizeGatewayArguments(name:string,value:any){
 if(name!=='toolkit'||value?.action!=='call'||typeof value.arguments!=='string'||value.arguments.length>1000000)return value;
 try{let parsed=JSON.parse(value.arguments);if(typeof parsed==='string')parsed=JSON.parse(parsed);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))return {...value,arguments:parsed};}catch(error){throw Object.assign(new Error('Tool arguments contain invalid JSON: '+(error as Error).message+'. No action was executed. Supply one complete object with correctly nested arrays; use the returned action example.'),{code:'INVALID_TOOL_JSON'});}
 return value;
}
export function normalizeDirectArguments(name:string,value:any,schema:any){
 if(name==='toolkit')return normalizeGatewayArguments(name,value);
 const decode=(input:any)=>{if(typeof input!=='string'||input.length>1000000)return input;try{return JSON.parse(input);}catch{return input;}};
 let parsed=decode(value);
 // Only recognize a complete transport wrapper. Never merge fields, invent
 // omitted arguments, or unwrap a real parameter named arguments.
 if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&!schema?.properties?.arguments){const keys=Object.keys(parsed);if(keys.every(key=>['name','arguments'].includes(key))&&Object.hasOwn(parsed,'arguments')&&(!Object.hasOwn(parsed,'name')||parsed.name===name)){const inner=decode(parsed.arguments);if(inner&&typeof inner==='object'&&!Array.isArray(inner))parsed=inner;}}
 // Some native templates serialize an absent optional string as JSON null or
 // the literal "null". Only this optional creation precondition is normalized;
 // real hashes and every required edit precondition remain untouched.
 if(name==='files_write'&&parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&Object.hasOwn(parsed,'expected_hash')&&(parsed.expected_hash===null||parsed.expected_hash==='null')){const {expected_hash,...rest}=parsed;parsed=rest;}
 // Empty unused selectors do not identify another file. Preserve conflicting
 // nonempty selectors so validation still rejects an ambiguous target.
 if(name==='browser_open_file'&&parsed&&typeof parsed==='object'&&!Array.isArray(parsed)){
  const selectors=['path','file_id','artifact_id'];
  if(selectors.filter(key=>typeof parsed[key]==='string'&&parsed[key].length>0).length===1)parsed=Object.fromEntries(Object.entries(parsed).filter(([key,value])=>!selectors.includes(key)||value!==''&&value!==null));
 }
 return parsed;
}

export function resolveToolTopic(query:string){
 const raw=query.trim().toLowerCase();const words=raw.split(/[\s./:_-]+/).filter(Boolean);
 const aliases:Record<string,string>={presentation:'slides',presentations:'slides',pptx:'slides',powerpoint:'slides',slide:'slides',excel:'sheets',xlsx:'sheets',spreadsheet:'sheets',spreadsheets:'sheets',terminal:'shell',docx:'documents',word:'documents',document:'documents',artifacts:'artifact'};
 const dotted=/^([\w-]+)[./:]([\w.-]+)$/.exec(raw);if(dotted)return {category:aliases[dotted[1]]??dotted[1],action:dotted[2]};
 const known=new Set(['slides','sheets','shell','documents','artifact','browser','computer','web','pdf','planning','python','file','directory','data','git','image','database','code','media','network','system','task','retrieval','mcp','http','schedule']);
 const first=words.find(word=>known.has(word)||aliases[word]);
 const category=first?(aliases[first]??first):raw;
 const action=words.find(word=>['create','edit','inspect','read','open','run','update','list','search','fetch','snapshot','export','patch'].includes(word));
 return {category,action};
}

export const CALL_GUIDELINES=`Call tools through the supplied native function interface. Printing JSON or promising an action does not execute it.
1. Read toolkit({"action":"discover","name":"guide","query":"CATEGORY","tool_action":"ACTION"}) for instructions, required fields and an example. Alternatively discover the exact action schema. Reuse that schema until it changes; do not repeat discovery instead of doing the task.
2. Execute toolkit({"action":"call","name":"CATEGORY","arguments":{"action":"ACTION",...required fields}}). arguments is an OBJECT, not a quoted JSON string, XML string or Markdown block. Put action inside this object for grouped categories. For a standalone tool, use its exact name and its own fields without inventing action.
3. Keep arrays as arrays, numbers as numbers and booleans as booleans. Omit unknown optional fields. Never combine two JSON objects in one arguments value. Each independent operation is a separate native call.
4. Obtain IDs from actual tool results. Browser: open/list tabs, snapshot, then interact with returned tab_id/snapshot_id/ref. Computer: screenshot, then current screen_id and screenshot coordinates. Files: use registered file_id or workspace-relative paths. Revisions: read before writing and use the returned version/hash. Jobs/agents/Python: create first, then reuse the returned ID.
5. Read the action's workflow and matching_skills. Load one relevant installed format/operation skill if not already loaded, then follow its quality guidance using the actual tool schema. Skills describe how to do good work; they do not change field names or require abandoning a working tool for a different runtime. Loading a skill does not create a file. Once the required schema is known, execute the requested action. Only ask the user when essential information is missing.
6. Inspect the returned status. Running is not finished; read/wait for completion. Publish returned file links or artifact IDs. Never invent success, downloads or evidence.
7. INVALID_ARGUMENTS/INVALID_TOOL_JSON: use the returned guidance to correct the named fields and retry the failed operation. Preserve successful results; do not replay them. Stale IDs require fresh observations. Conflicts require a fresh read. Permission/runtime failures require explaining the actual limitation, not bypassing it. Unknown outcomes require inspecting effects before retrying.`;

function resolve(schema:any,root:any){return schema?.$ref?.startsWith('#/$defs/')?root.$defs?.[schema.$ref.slice(8)]??schema:schema??{};}
function variants(schema:any):any[]{const options=schema.oneOf??schema.anyOf;return options?options.flatMap(variants):[schema];}
function exampleValue(schema:any,root:any,key:string,depth=0):any{
 schema=resolve(schema,root);if(schema.default!==undefined)return schema.default;if(schema.const!==undefined)return schema.const;if(schema.enum?.length)return schema.enum[0];if(depth>6)return null;
 if(schema.oneOf||schema.anyOf)return exampleValue(variants(schema).find(item=>item.type!=='null')??variants(schema)[0],root,key,depth+1);
 if(schema.type==='object'){const fields=Object.fromEntries((schema.required??[]).filter((name:string)=>schema.properties?.[name]).map((name:string)=>[name,exampleValue(schema.properties[name],root,name,depth+1)]));if(!Object.keys(fields).length&&schema.additionalProperties&&typeof schema.additionalProperties==='object')return {example:exampleValue(schema.additionalProperties,root,key,depth+1)};return fields;}
 if(schema.type==='array')return Array.from({length:Math.max(1,Math.min(3,schema.minItems??1))},()=>exampleValue(schema.items??{},root,key,depth+1));
 if(schema.type==='boolean')return false;if(schema.type==='number'||schema.type==='integer')return schema.minimum??(typeof schema.exclusiveMinimum==='number'?schema.exclusiveMinimum+1:1);if(schema.type==='null')return null;
 if(/(?:^|_)id$|^ref$|hash|version/.test(key))return '<actual '+key+' from a previous tool result>';
 const samples:Record<string,string>={url:'https://example.com',output_name:'output.xlsx',path:'outputs/example.txt',cwd:'.',command:'node --version',expression:'2+2',query:'balance sheet',text:'Example content',content:'Example content\n',source:'# Example\n\nContent.',title:'Example output',name:'Example',sheet:'Balance sheet',cell:'B3',range:'A1:B12',field:'amount',group_by:'category',key:'id',language:'python',code:'print("Horizon")',key_name:'Enter',relative_path:'references/guide.md'};
 return samples[key]??'<'+key+': '+(schema.description??schema.type??'schema-valid value')+'>';
}
function entries(registry:ToolRegistry,ctx?:ToolContext){return [...registry.tools.values()].filter(tool=>!isToolGroup(tool.name)&&!['toolkit','discover_tools'].includes(tool.name)&&(!ctx||decideTool(tool,ctx,ctx.app.store.get('settings','main')??{}).allowed)).map(tool=>({tool,category:groupForLeaf(tool.name)??tool.name,action:groupAction(tool.name),schema:tool.inputSchema??z.toJSONSchema(tool.input)}));}
function entryGuide(entry:ReturnType<typeof entries>[number],ctx?:ToolContext,catalog:any[]=[]){
 const {tool,category,action,schema}=entry;
 const workflow=operationWorkflow(category,tool.name);
 const preferred:Record<string,string>={sheets:'openclaude-spreadsheet-workflow',data:'openclaude-spreadsheet-workflow',documents:'openclaude-document-workflow',pdf:'openclaude-document-workflow',slides:'openclaude-presentation-workflow',shell:'openclaude-terminal-workflow',file:'openclaude-terminal-workflow',directory:'openclaude-terminal-workflow',git:'openclaude-terminal-workflow',browser:'openclaude-browser-and-computer',computer:'openclaude-browser-and-computer',agent:'openclaude-runtime-orchestration',planning:'openclaude-runtime-orchestration',artifact:'openclaude-data-and-creative-workflows',python:'openclaude-data-and-creative-workflows',retrieval:'openclaude-data-and-creative-workflows'};
 const score=(skill:any)=>(skill.id===preferred[category]||skill.id===canonicalAlias(preferred[category]??''))?100:skill.id==='openclaude-tool-operation'?1:workflow.skill_topics.some(topic=>String(skill.name).toLowerCase().includes(topic))?20:skill.id==='openclaude-data-and-creative-workflows'?10:0;
 const skills=(ctx?.app.ephemeral.get('installedSkills')??catalog).filter((skill:any)=>skill.installed!==false&&skill.available!==false&&skill.enabled!==false&&(skill.relatedTools??[]).some((name:string)=>name==='*'||name===category||name===tool.name)&&score(skill)>0).sort((a:any,b:any)=>score(b)-score(a)).slice(0,4).map((skill:any)=>({skill_id:skill.id,name:skill.name,purpose:String(skill.description??'').slice(0,280),already_loaded:ctx?.loadedSkills.has(skill.id)??false,load_call:{action:'call',name:'skill_load',arguments:{skill_id:skill.id}}}));
 const examples=operationExamples[tool.name];
 const asCategory=(input:any)=>{let args={...input};if(action){if(Object.hasOwn(args,'action')){const {action:operation,...rest}=args;args={...rest,operation};}args={action,...args};}return args;};
 const directExamples=(examples??variants(schema).map(branch=>exampleValue(branch,schema,'arguments'))).map(input=>({function:tool.name,parameters:input}));
 const callExamples=directExamples.map(example=>({action:'call',name:category,arguments:asCategory(example.parameters)}));
 return {category,action,tool:tool.name,when_to_use:tool.description,workflow,matching_skills:skills,skill_policy:'Use a matching installed skill once for quality guidance, then execute. Do not keep loading skills or invent skill IDs. The live tool schema takes precedence over external tool names in a skill.',prerequisites:tool.requires??'Normal workspace permissions and the configured runtime/connection for this action.',available:!tool.available?.(),unavailable_reason:tool.available?.()??null,variants:variants(schema).map((branch,index)=>{
  return {required_fields:action?['action',...(branch.required??[]).map((key:string)=>key==='action'?'operation':key)]:branch.required??[],fields:Object.entries(branch.properties??{}).map(([name,raw])=>{const value=resolve(raw,schema);return {name:action&&name==='action'?'operation':name,type:value.type??(value.oneOf||value.anyOf?'one of the schema alternatives':'see schema'),required:(branch.required??[]).includes(name),description:value.description,choices:value.enum,constraint:value.pattern??value.format,minimum:value.minimum,maximum:value.maximum};}),call_example:callExamples[Math.min(index,callExamples.length-1)]};
 }),direct_call_examples:directExamples,call_examples:callExamples,result_handling:['Read status and error before continuing. Keep returned IDs, revisions, hashes and output offsets for dependent calls.','For running jobs read/wait until completion. For created files/artifacts use their real IDs and download links.','Validation failures: correct the named fields using this guide. Stale observations: inspect again. Unavailable runtime/permission: explain the actual limitation.'],example_note:'Examples are templates, not executed operations. Replace every angle-bracket placeholder with an observed ID or actual user value. Zero workbook inputs are illustrative; do not invent financial figures. A UUID/hash/version placeholder must be replaced by its correctly typed actual value.'};
}
export function toolReference(registry:ToolRegistry,ctx:ToolContext,query='',action?:string){
 const all=entries(registry,ctx);const raw=query.trim();const resolved=resolveToolTopic(raw);const category=groupForLeaf(raw)??resolved.category;const selectedAction=action??(groupForLeaf(raw)?groupAction(raw):resolved.action);
 if(!raw)return {guidelines:CALL_GUIDELINES,categories:[...new Set(all.map(item=>item.category))],read_category:{action:'discover',name:'guide',query:'sheets'},read_action:{action:'discover',name:'guide',query:'sheets',tool_action:'create'}};
 const selected=all.filter(item=>item.category===category&&(!selectedAction||item.action===selectedAction||item.tool.name===raw));
 const available=selected.some(entry=>!entry.tool.available?.());const reason=selected.length&&!available?selected[0].tool.available?.():undefined;
 return {guidelines:CALL_GUIDELINES,category,registered:selected.length>0,available,unavailable_reason:reason??null,actions:selected.map(entry=>selectedAction||!entry.action?entryGuide(entry,ctx):{action:entry.action,tool:entry.tool.name,when_to_use:entry.tool.description,available:!entry.tool.available?.(),unavailable_reason:entry.tool.available?.()??null,read_guide:{action:'discover',name:'guide',query:entry.category,tool_action:entry.action}}),summary:reason?'The tool exists, but its execution runtime is unavailable: '+reason+'. Do not repeat discovery, invent another tool or use a different channel to bypass this blocker. Skills do not supply a runtime.':selected.length?(selectedAction?'Use the example shape with real values, then execute. Do not rediscover this action unless its schema changes.':'Choose an action and read its guide once before execution.'):'No permitted matching tool. Check the selected workflow and tool permissions; do not invent access.'};
}
export function toolFailureGuidance(registry:ToolRegistry,name:string,args:any,ctx?:ToolContext){
 const tool=registry.tools.get(name);if(!tool)return undefined;
 if(name==='artifact_save'&&typeof args?.artifact_id==='string'){
  let current:any;try{if(ctx)current=artifactById(args.artifact_id,ctx);}catch{}
  const patch=typeof args.find==='string';return {function:name,required_fields:patch?['artifact_id','expected_version','expected_hash','find','replace']:['artifact_id','expected_version','source'],example_arguments:{artifact_id:current?.id??args.artifact_id,expected_version:current?.version??1,...(patch?{expected_hash:current?digestForGuidance(current.source):'<source_hash returned by artifact_read>',find:'<one exact unique substring from artifact_read>',replace:'<replacement text>'}:{source:'<complete revised source preserving unrelated content>'})},next:'This is a revision, not a new artifact. Read the latest artifact, copy its current expected_version unchanged, and call artifact_save with the same artifact_id. Do not remove the identity or invent a future version.'};
 }
 if(name==='toolkit'){
  const target=typeof args?.name==='string'?args.name:undefined;
  let supplied=args?.arguments;if(typeof supplied==='string')try{supplied=JSON.parse(supplied);}catch{}
  const action=supplied?.action;
  const entry=entries(registry).find(item=>(item.category===target||item.tool.name===target)&&(!action||item.action===action));
  return {rule:'arguments must be an object. For a category include its action inside arguments; direct category functions take flat fields.',discover_example:{action:'discover',name:'guide',...(target?{query:target}:{}),...(typeof action==='string'?{tool_action:action}:{})},...(entry?{calling_guide:entryGuide(entry)}:{}),next:'Use this failed operation guide to correct the named fields, then execute. Do not repeat completed operations, narrate discovery or switch to an unrelated tool.'};
 }
 const entry=entries(registry).find(item=>item.tool.name===name||(item.category===name&&item.action===args?.action));
 if(entry){const schema=entry.schema;const examples=operationExamples[name]??variants(schema).map(branch=>exampleValue(branch,schema,'arguments'));return {function:name,required_fields:schema.required??[],example_arguments:examples[0],workflow:operationWorkflow(entry.category,name),next:'Call '+name+' directly with these named fields. Do not add a toolkit, category or arguments wrapper. Correct the failed fields and retry only this operation.'};}
 return {next:'Use discover_tools only if this operation is missing, then call its actual function name directly.'};
}
export function renderToolReference(registry:ToolRegistry,catalog:any[]=[]){
 let text='# Horizon tool operating reference\n\nGenerated from the registered tool schemas. Examples are templates, not executed operations. Live guidance applies current permissions, installed skills and runtime availability; this document does not grant access.\n\n'+'Call the offered function directly with its named fields. Do not wrap parameters in toolkit, category or arguments. The application supplies relevant tools and automatically loads creation guidance. Use discover_tools only when an operation is missing; do not repeat discovery before doing the task. Keep successful results and correct only the failed fields. Observe permission and plan-approval gates.\n\n';
 text+='## How to read each action\n\nEach action includes its actual callable function, purpose, workflow, quality checks, skill links and complete parameter examples. In examples, function identifies the native function and parameters shows its argument object; send those fields directly to that function. Do not send this example wrapper as arguments. Only include action when the actual function schema requires it. Replace observation placeholders and read returned state before dependent calls.\n\n';
 for(const entry of entries(registry)){
  const guide=entryGuide(entry,undefined,catalog);
  text+='## '+entry.category+(entry.action?'.'+entry.action:'')+'\n\nCallable function: `'+entry.tool.name+'`.\n\n'+guide.when_to_use+'\n\nPrerequisites: '+guide.prerequisites+'\n\n### Workflow\n\n'+guide.workflow.steps.map((step,index)=>(index+1)+'. '+step).join('\n')+'\n\n### Quality checks\n\n'+guide.workflow.quality_checks.map(item=>'- '+item).join('\n')+'\n\n### Avoid\n\n'+guide.workflow.pitfalls.map(item=>'- '+item).join('\n')+'\n\n### Related skills\n\n';
  text+=guide.matching_skills.length?guide.matching_skills.map((skill:any)=>'- '+skill.name+' (`'+skill.skill_id+'`): '+skill.purpose+'\n  Load once: `'+JSON.stringify({function:'skill_load',parameters:{skill_id:skill.skill_id}})+'`').join('\n')+'\n\n':'Match installed skills by: '+guide.workflow.skill_topics.join(', ')+'. If none is installed, follow the workflow and schema above without inventing a skill.\n\n';
  for(const branch of variants(entry.schema)){const variant={required_fields:branch.required??[],fields:Object.entries(branch.properties??{}).map(([name,value])=>({name,...resolve(value,entry.schema),required:(branch.required??[]).includes(name),choices:resolve(value,entry.schema).enum}))};text+='Required fields: '+(variant.required_fields.join(', ')||'none')+'.\n\n';for(const field of variant.fields)text+='- `'+field.name+'` ('+field.type+', '+(field.required?'required':'optional')+'): '+(field.description??'Use the schema-defined value.')+(field.choices?' Allowed: '+JSON.stringify(field.choices)+'.':'')+'\n';text+='\n';}
  text+='### Complete call examples\n\n';for(const example of guide.direct_call_examples)text+='```json\n'+JSON.stringify(example,null,2)+'\n```\n\n';
  text+='### After the call\n\n'+guide.result_handling.map(item=>'- '+item).join('\n')+'\n\n'+guide.example_note+'\n\n';
 }
 return text;
}
