import type {ToolContext} from './registry.ts';
import {groupForLeaf,isToolGroup} from './groups.ts';

export interface TaskToolScope {version:1;profiles:string[];families:string[];source:'explicit'|'prompt';}
const support=new Set(['toolkit','discover_tools','ask_user','runtime_capabilities','tool_output_read','clock_now','calculate','project_search','conversation_search','conversation_read','task_create','task_update','task_cancel','task_list']);
const dependencies:Record<string,string[]>={
 sheets:['file','documents','data'],pdf:['file','documents'],documents:['file'],slides:['file','documents','artifact'],
 artifact:['file'],code:['file','directory','archive','shell','git'],shell:['file','directory','code'],
 media:['file','image','documents'],image:['file'],retrieval:['file','directory'],database:['file'],python:['file','data'],git:['file'],
 browser:['file'],computer:[],agent:['planning','task'],goal:['planning','task'],planning:['file','web','retrieval'],file:['directory','archive'],
 schedule:['queue','notification'],mcp:['connector'],http:['api'],network:['file','web','http'],custom:['code'],template:['file'],workflow:['code','web','browser','documents','sheets','slides','media'],
};
export function taskToolProfile(request:string,mode?:string):string[]{
 const explicit:Record<string,string>={browser:'browser',computer:'computer',excel:'sheets',pdf:'pdf',document:'documents',documents:'documents',presentation:'slides',slides:'slides',sketch:'artifact'};
 if(mode&&explicit[mode])return [explicit[mode]];
 const chosen:string[]=[];const add=(name:string)=>{if(!chosen.includes(name))chosen.push(name);};
 if(mode==='plan')add('planning');if(mode==='goal')add('goal');
 const rules:[string,RegExp][]=[
 ['sheets',/\b(excel|xlsx|spreadsheet|balance\s*sheet|workbook)\b/i],['pdf',/\b(pdf|ocr|scanned document)\b/i],
 ['documents',/\b(docx|word document|word file|document|markdown conversion)\b/i],['slides',/\b(presentation|slides|pptx|powerpoint)\b/i],
 ['artifact',/\b(artifact|visuali[sz]e|visuali[sz]ation|roadmap|diagram|flowchart|html|svg|interactive|mockup|infographic)\b/i],
 ['code',/\b(code|coding|debug|repository|repo|implement|function|bug|compile|script|package|build app|lint|unit test|symbol|typescript|javascript|react|rust)\b|\b(?:create|build|implement)\b.{0,70}\b(?:app|application|website|dashboard|software)\b/i],
 ['shell',/\b(terminal|shell|powershell|command|process|environment variable)\b/i],['git',/\b(git|commit|branch|pull request)\b/i],
 ['browser',/\b(browser|browse|navigate|webpage|click|scroll)\b|\bopen\b.{0,40}\b(?:html|file|presentation)\b/i],['computer',/\b(computer|desktop|screenshot|clipboard|window resize|window move|accessibility)\b/i],
 ['web',/\b(search|research|latest|sources|look up|news|crawl|fetch)\b/i],['python',/\b(python|notebook|interpreter)\b/i],
 ['data',/\b(csv|dataset|aggregate|data analysis)\b/i],['memory',/\b(remember|memory|forget)\b/i],
 ['goal',/\b(goal|autonomous)\b/i],['planning',/\b(plan|planning)\b/i],['task',/\b(tasks?|todo|checklist)\b/i],
 ['schedule',/\b(schedule|remind|tomorrow|recurring|clock|current time)\b/i],['queue',/\b(queue|queued|follow.up)\b/i],
 ['webhook',/\b(webhook|callback)\b/i],['mcp',/\b(mcp|connector|integration)\b/i],['http',/\b(http|rest api|endpoint)\b/i],
 ['workflow',/\b(workflow|replay|record these steps)\b/i],['lifecycle',/\b(lifecycle|hook)\b/i],['trigger',/\b(trigger|when .*completes|on completion)\b/i],
 ['notification',/\b(notification|notify|alert)\b/i],['template',/\b(template|environment)\b/i],['custom',/\b(create (?:a |my |your )?(?:own |new )?tool|custom tool)\b/i],
 ['agent',/\b(agent|delegate|parallel|team)\b/i],['skills',/\b(skill|skills)\b/i],
 ['media',/\b(media|audio|videos?|ffmpeg|transcrib\w*|images?|photos?|pictures?)\b/i],
 ['retrieval',/\b(semantic|retrieval|index|rerank|chunks)\b/i],['database',/\b(database|sqlite|sql|table schema)\b/i],
 ['network',/\b(dns|ping|port|upload|download|network)\b/i],['system',/\b(system info|cpu|gpu|ram|disk|installed apps|resource usage|memory usage|free memory|available memory)\b/i],
 ['file',/\b(file|files|folder|folders|directory|directories|workspace|hash|checksum|archive|zip)\b/i],
 ];
 for(const [name,pattern] of rules)if(pattern.test(request))add(name);
 // A requested plan is a saved deliverable; explicit Plan mode is gated separately.
 if(/\b(?:create|make|build|design)\b.{0,70}\bplan\b/i.test(request))add('artifact');
 for(const match of request.matchAll(/(?:^|\s)\/([A-Za-z][A-Za-z0-9_]{1,99})\b/g)){
  const family=groupForLeaf(match[1]);if(family)add(family);
 }
 // A URL is not an instruction to control a browser. Retrieval is sufficient
 // unless the user asks for interaction or explicitly selects Browser.
 if(/https?:\/\//i.test(request)&&!chosen.includes('browser'))add('web');
 const onlySearch=/\b(?:only|just)\s+(?:use\s+)?(?:the\s+)?web\s+search\b/i.test(request);
 const searchSubject=/^\s*(?:web search|search (?:for|the web)|research (?:about|on)|look up|find (?:the )?best)\b/i.test(request)&&!/[.;]\s*(?:then|also)|\b(?:and then|then create|then build|then edit|also create|also build|also edit)\b/i.test(request);
 if(onlySearch||searchSubject)return ['web',...(chosen.includes('memory')?['memory']:[])];
 if(!chosen.length&&/\b(create|make|build|draw|design)\b/i.test(request))add('artifact');
 return chosen;
}
export function makeTaskScope(request:string,mode?:string):TaskToolScope{
 const profiles=taskToolProfile(request,mode);const families=new Set(['memory','skills']);
 const add=(name:string)=>{if(families.has(name))return;families.add(name);for(const dependency of dependencies[name]??[])add(dependency);};
 for(const profile of profiles)add(profile);
 if(!profiles.length)add('web');
 if(families.has('file')){families.add('directory');families.add('archive');}
 return {version:1,profiles,families:[...families].sort(),source:mode&& !['chat','plan','goal'].includes(mode)?'explicit':'prompt'};
}
export function setTaskScope(ctx:ToolContext,request:string,mode=ctx.taskMode){
 ctx.taskRequest=request;
 const selected=ctx.taskSelection?(groupForLeaf(ctx.taskSelection)??ctx.taskSelection.split('_')[0]):undefined;
 if(selected){const scope=makeTaskScope('',mode);const families=new Set(['memory','skills']);const add=(family:string)=>{if(families.has(family))return;families.add(family);for(const dependency of dependencies[family]??[])add(dependency);};add(selected);ctx.taskScope={...scope,profiles:[selected],families:[...families].sort(),source:'explicit'};}
 else ctx.taskScope=makeTaskScope(request,mode);
 return ctx.taskScope;
}
export function scopeAllows(name:string,ctx:ToolContext):boolean{
 if(!ctx.taskScope||support.has(name)||name==='plan_read'||name==='plan_update')return true;
 // Wrappers never grant authority: their concrete operations are checked again.
 if(isToolGroup(name))return true;
 const family=groupForLeaf(name)??(/^memory_/.test(name)?'memory':/^(skill_|skills_)/.test(name)?'skills':/^research_/.test(name)?'web':/^connector_/.test(name)?'connector':name==='programmatic_tools'?'python':name==='goal'?'goal':name.startsWith('team_')?'agent':name.startsWith('environment_')?'template':name.startsWith('custom_tool_')?'custom':name.split('_')[0]);
 return ctx.taskScope.families.includes(family);
}
