import {taskToolProfile} from '../../tools/task-routing.ts';
import {sp,ecc,canonicalAlias} from './relationships.ts';
import type {Selection} from './types.ts';
/** Instruction selection only. This never changes the allowed tool set. */
export function resolveTaskSkills(request:string,mode:string|undefined,skills:any[],bindings:Record<string,string>={},limit=3):Selection{
 const profiles=new Set(taskToolProfile(request,mode)),reasons:Record<string,string>={},wanted:string[]=[],skipped:Selection['skipped']=[];
 const push=(id:string,reason:string)=>{if(!wanted.includes(id)){wanted.push(id);reasons[id]=reason;}};
 const command=request.match(/^\/([a-z0-9-]+)\b/i)?.[1]?.toLowerCase();const selectedCommand=command&&skills.find(s=>s.category==='Commands'&&s.name==='ecc-command-'+command);
 if(selectedCommand)push(selectedCommand.id,'Explicit upstream workflow command');
 const resolveId=(id:string)=>{const canonical=canonicalAlias(id);return skills.find(skill=>skill.id===canonical||skill.aliases?.includes(id)||skill.aliases?.includes(canonical))?.id??canonical;};
 const excluded=new Set(Object.entries(bindings).filter(([,v])=>v==='exclude').map(([id])=>resolveId(id)));
 for(const [id,binding]of Object.entries(bindings))if(binding==='include')push(resolveId(id),'Explicit conversation selection');
 const office=/\b(excel|xlsx|spreadsheet|balance\s*sheet|workbook|docx|word document|slides|pptx|presentation|powerpoint)\b/i.test(request);
 const documentTask=office||/\bpdf\b/i.test(request);
 const explicitCode=/\b(code|coding|script|repository|node\.?js|react|typescript|python)\b/i.test(request);
 const code=profiles.has('code')&&((!documentTask&&!profiles.has('artifact'))||explicitCode);
 const browserPrimary=profiles.has('browser')&&!code&&!documentTask&&(/\b(browser|browse|navigate|webpage|click|scroll)\b|\bopen\b.{0,40}\b(?:html|file|presentation)\b/i.test(request)||mode==='browser');
 const researchPrimary=(profiles.has('research')||profiles.has('web'))&&!code&&!documentTask&&!browserPrimary&&!profiles.has('artifact');
 let operating:string|undefined;const bind=(id:string,reason:string)=>{operating=id;push(id,reason);};
 // Reserve the operating binding before optional specialists can consume the budget.
 if(office)bind('horizon:adapter:documents','OfficeCLI creation/revision binding');
 else if(/\bpdf\b/i.test(request))bind('horizon:adapter:pdf','Independent local PDF binding');
 else if(browserPrimary||code)bind('horizon:adapter:interaction','Actual observed browser/files/terminal operations');
 else if(profiles.has('artifact'))bind('horizon:adapter:artifacts','Preserve the artifact identity and current version');
 if(!selectedCommand&&(profiles.has('planning')||/\bbrainstorm(?:ing)?\b/i.test(request)))push(/\bbrainstorm(?:ing)?|approaches|trade.?offs\b/i.test(request)?sp('brainstorming'):sp('writing-plans'),'Requested planning stage');
 if(code&&/\b(fix|debug|fail(?:ed|ure)?|error|regression|exception)\b/i.test(request))push(sp('systematic-debugging'),'Investigate a code failure before changing it');
 else if(code&&/\b(from scratch|new project|new app|brainstorm|architecture)\b/i.test(request))push(sp('brainstorming'),'Clarify a new project before implementation');
 const visual=/\b(frontend|front.end|react|css|website|dashboard|interface|artifact|html|svg|visuali[sz]e)\b/i.test(request);
 if(visual&&!browserPrimary&&!office)push('github:anthropics/skills:skills/frontend-design','Frontend design guidance');
 if(code&&/\b(?:tests?|node:test|verification)\b/i.test(request)&&!/(?:do not|don't|without|no)\s+(?:run(?:ning)?\s+)?tests?/i.test(request))push(sp('test-driven-development'),'Requested coding tests and regression discipline');
 if(code)push(ecc('codebase-onboarding'),'Inspect the existing workspace before coding');
 if(profiles.has('research')||profiles.has('web'))push(ecc('research-ops'),'Research workflow');
 const words=[...new Set(request.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g)??[])].filter(w=>!['please','create','make','with','from','this','that','want','have','your','using','work','should','tool','tools','workspace','task','actual','proper','first','then'].includes(w));
 const domainName=/\bpdf\b/i.test(request)?/pdf/i:/\b(excel|xlsx|spreadsheet|balance\s*sheet|workbook)\b/i.test(request)?/spreadsheet|excel|xlsx|workbook/i:/\b(slides|pptx|presentation|powerpoint)\b/i.test(request)?/presentation|slides|pptx|powerpoint/i:office?/docx|word|document/i:undefined;
 const specialists=skills.filter(s=>s.installed!==false&&s.enabled!==false&&s.runtimeReady!==false&&(!/pentest|penetration|exploit|red.team|vulnerability/i.test(s.name)||/\b(?:security|pentest|penetration|exploit|vulnerabilit|attack|red.team)/i.test(request))&&(!documentTask||['Documents','Design'].includes(s.category)&&!!domainName?.test(s.name))&&(!researchPrimary||s.name===request.trim())&&(!profiles.has('artifact')||code||documentTask||s.category==='Design')&&!String(s.id).startsWith('horizon:adapter:')&&!String(s.id).startsWith('github:obra/superpowers:')&&!(office&&/frontend.slides|html.slides|reveal/i.test(s.name))).map(s=>({skill:s,score:words.reduce((score,word)=>score+(String(s.name).toLowerCase().includes(word)?4:0)+(String(s.description).toLowerCase().includes(word)?1:0),0)})).filter(s=>s.score>=5).sort((a,b)=>b.score-a.score);
 if(specialists[0])push(specialists[0].skill.id,'Relevant installed specialist: '+specialists[0].skill.name);
 if(/\b(verify|verification|validate|test|review)\b/i.test(request))push(sp('verification-before-completion'),'Requested evidence of completion');
 for(const skill of skills.filter(s=>s.preferred))push(skill.id,'Assistant or user preferred workflow');
 const result:string[]=[];
 const ordered=operating?[operating,...wanted.filter(id=>id!==operating)]:wanted;
 for(const id of ordered){const skill=skills.find(s=>s.id===id||s.aliases?.includes(id));if(skill&&result.includes(skill.id))continue;const reason=excluded.has(skill?.id??id)?'Excluded from this conversation':!skill?'Not installed or unavailable in this conversation':skill.installed===false?'Not installed':skill.enabled===false?'Disabled':skill.runtimeReady===false?'Runtime or adapter unavailable':result.length>=limit?'Deferred to the next relevant workflow stage':null;if(reason){skipped.push({id,reason});continue;}result.push(skill!.id);if(skill!.id!==id){reasons[skill!.id]=reasons[id];delete reasons[id];}}
 return {skillIds:result,reasons,skipped};
}
