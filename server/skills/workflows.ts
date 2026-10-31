import {readFile} from 'node:fs/promises';import{join}from'node:path';
import{taskToolProfile}from'../tools/task-routing.ts';
export interface BundledWorkflow{folder:string;id:string;name:string;description:string;profiles:string[];tools:string[];category?:string;subcategory?:string;routes?:string[];upstreamSkillId?:string;}
export async function bundledWorkflows(root:string):Promise<BundledWorkflow[]>{try{const value=JSON.parse(await readFile(join(root,'skills/built-in/workflows.json'),'utf8'));if(value.version!==1||!Array.isArray(value.workflows))throw Error('Unsupported workflow catalog');for(const w of value.workflows)if(!/^[a-z0-9-]+$/.test(w.folder)||typeof w.id!=='string'||!Array.isArray(w.tools)||!Array.isArray(w.profiles))throw Error('Invalid bundled workflow descriptor');return value.workflows;}catch(error){if((error as any).code==='ENOENT')return [];throw error;}}
/** Route instructions only; this never changes tool scope, permissions or approvals. */
export function selectTaskWorkflows(request:string,mode:string|undefined,workflows:BundledWorkflow[]){
 const profiles=new Set(taskToolProfile(request,mode));const selected=new Set<string>();const add=(id:string)=>{if(workflows.some(w=>w.id===id))selected.add(id);};
 const brainstorm=/\b(brainstorm|approaches|trade.off|architecture|from scratch|new project|new app)\b/i.test(request)||profiles.has('code')&&/\b(create|build|design)\b/i.test(request);
 if(brainstorm||profiles.has('planning'))add('horizon-planning-workflow');
 const visual=profiles.has('artifact')&&/\b(html|svg|visual|roadmap|diagram|dashboard|interactive|mockup|page|website)\b/i.test(request)||profiles.has('code')&&/\b(frontend|front.end|react|css|website|dashboard|interface|component)\b/i.test(request);
 if(visual)add('horizon-frontend-design');
 const artifactOnly=profiles.has('artifact')&&!/\b(repository|repo|backend|source files?|unit tests?|npm|package.json)\b/i.test(request);
 for(const w of workflows)if(w.profiles.some(p=>profiles.has(p))&&!(artifactOnly&&w.id==='horizon-coding-workflow'))selected.add(w.id);
 if(profiles.has('code')&&/\b(fix|debug|errors?|fail(?:ed|ure)?|exception|regression)\b/i.test(request))add('horizon-systematic-debugging');
 if(/\b(verify|verification|validate|test|audit|review)\b/i.test(request))add('horizon-verification-workflow');
 if(!selected.size)add('openclaude-tool-operation');
 return [...selected];
}
