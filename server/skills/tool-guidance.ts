import {randomUUID} from 'node:crypto';
import type {ToolContext,ToolRegistry} from '../tools/registry.ts';

export const creationSkills:Record<string,string>={artifact_save:'openclaude-data-and-creative-workflows',spreadsheet_create:'openclaude-spreadsheet-workflow',spreadsheet_edit:'openclaude-spreadsheet-workflow',spreadsheet_chart:'openclaude-spreadsheet-workflow',document_edit:'openclaude-document-workflow',document_create:'openclaude-document-workflow',pdf_edit:'openclaude-document-workflow',slides_create:'openclaude-presentation-workflow',slides_edit:'openclaude-presentation-workflow',artifact_create:'openclaude-data-and-creative-workflows',artifact_draft_start:'openclaude-data-and-creative-workflows',artifact_update:'openclaude-data-and-creative-workflows',artifact_patch:'openclaude-data-and-creative-workflows'};
export async function ensureCreationSkill(name:string,registry:ToolRegistry,ctx:ToolContext){
 const skill_id=creationSkills[name];if(!skill_id||ctx.loadedSkills.has(skill_id))return;
 const result=await registry.execute({id:'creation-skill-'+randomUUID(),name:'skill_load',arguments:{skill_id}},ctx);
 if(result.status!=='succeeded')throw Object.assign(new Error('The required creation workflow could not be loaded: '+(result.error?.message??result.summary)+'. No creation action was executed.'),{code:'CREATION_SKILL_UNAVAILABLE'});
}
export async function prepareCreationSkills(request:string,registry:ToolRegistry,ctx:ToolContext){
 const categories:[RegExp,string][]=[[/\b(excel|xlsx|spreadsheet|balance\s*sheet|workbook)\b/i,'spreadsheet_create'],[/\b(pdf|docx|word document)\b/i,'document_create'],[/\b(presentation|slides|pptx|powerpoint)\b/i,'slides_create'],[/\b(artifact|html|svg|interactive app|visuali[sz]e|visuali[sz]ation|roadmap|diagram|flowchart|mockup)\b/i,'artifact_create']];
 for(const [pattern,name] of categories)if(pattern.test(request)){await ensureCreationSkill(name,registry,ctx);ctx.discoveredTools??=new Set();ctx.discoveredTools.add(name==='spreadsheet_create'?'sheets':name==='slides_create'?'slides':name==='document_create'?'documents':'artifact');}
}

/** Load one relevant workflow through the normal registry, not a bypass. */
export async function attachOperationSkill(guide:any,registry:ToolRegistry,ctx:ToolContext){
 const first=guide.matching_skills?.[0]??guide.actions?.find((item:any)=>item.matching_skills?.length)?.matching_skills[0]??guide.tools?.flatMap((tool:any)=>tool.calling_guide?.actions??[]).find((item:any)=>item.matching_skills?.length)?.matching_skills[0];
 if(!first)return guide;
 if(ctx.loadedSkills.has(first.skill_id))return {...guide,skill_guidance:{skill_id:first.skill_id,name:first.name,status:'already_loaded',next:'Reuse the loaded workflow and execute the action. Do not load or discover it again.'}};
 const result=await registry.execute({id:'guide-skill-'+randomUUID(),name:'skill_load',arguments:{skill_id:first.skill_id}},ctx);
 if(result.status!=='succeeded')return {...guide,skill_guidance:{skill_id:first.skill_id,status:'unavailable',reason:result.error?.message??result.summary,next:'The action workflow and schema remain usable. Do not invent a loaded skill or bypass the failure.'}};
 const instructions=String(result.data?.instructions??'');
 return {...guide,skill_guidance:{skill_id:first.skill_id,name:first.name,status:'loaded',instructions:instructions.slice(0,9000),truncated:instructions.length>9000,next:'This workflow is loaded for this run. Execute the action using its schema and example; do not load it again. Read supporting resources only when needed.'}};
}
