import {canonicalAlias} from './ecosystem/relationships.ts';
import {ecosystemEnabled} from './ecosystem/sources.ts';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {AppContext} from '../app.ts';
import {loadCatalog} from './catalog.ts';

export type SkillBinding='auto'|'include'|'exclude';
export const bundledAssistants=[
 {id:'general',name:'General',description:'Use installed skills when relevant.',skillIds:[]},
 {id:'office',name:'Office',description:'Documents, workbooks and presentations.',skillIds:['openclaude-document-workflow','openclaude-spreadsheet-workflow','openclaude-presentation-workflow']},
 {id:'pdf',name:'PDF',description:'Create, inspect and revise PDF documents.',skillIds:['openclaude-document-workflow']},
 {id:'coding',name:'Coding',description:'Inspect projects and verify code changes.',skillIds:['horizon-coding-workflow','horizon-verification-workflow']},
 {id:'research',name:'Research',description:'Find and evaluate sources.',skillIds:['horizon-research-workflow','openclaude-tool-operation']},
 {id:'browser',name:'Browser',description:'Work with observed browser state.',skillIds:['openclaude-browser-and-computer']},
].map(item=>({...item,builtIn:true}));

export function assistantCatalog(app:AppContext):any[]{return [...bundledAssistants,...app.store.list('assistants').filter(item=>!bundledAssistants.some(preset=>preset.id===item.id)).map(item=>({...item,builtIn:false}))];}
export function conversationSkillBindings(conversation:any):Record<string,SkillBinding>{
 const legacy=Object.fromEntries((Array.isArray(conversation?.skillIds)?conversation.skillIds:[]).filter((id:any)=>typeof id==='string').map((id:string)=>[id,'include']));
 const bindings=conversation?.skillBindings;
 return {...legacy,...(bindings&&typeof bindings==='object'&&!Array.isArray(bindings)?Object.fromEntries(Object.entries(bindings).filter(([,mode])=>['auto','include','exclude'].includes(String(mode)))):{})};
}

/** Selection only changes workflow context. It never installs skills or grants tools. */
export async function resolveConversationSkills(app:AppContext,conversation:any={},assistant?:any){
 const catalog=await loadCatalog(app),assistants=assistantCatalog(app);
 const selected=assistant??assistants.find(item=>item.id===(conversation.assistantId??'general'))??assistants[0];
 const workflow=assistants.find(item=>item.id===conversation.workflowPresetId);
 const useEcosystem=await ecosystemEnabled(app);const canonical=(id:string)=>useEcosystem&&!app.store.get('skills',id)?canonicalAlias(id):id;const defaultIds=(item:any):string[]=>useEcosystem&&item?.builtIn&&item.id==='pdf'?['horizon:adapter:pdf']:item?.skillIds??[];const defaults=new Set<string>([...defaultIds(selected),...defaultIds(workflow)].map(canonical));
 const rawBindings=conversationSkillBindings(conversation);const bindings:Record<string,SkillBinding>={};for(const [id,mode]of Object.entries(rawBindings)){const key=canonical(id);if(bindings[key]!=='exclude'||mode==='exclude')bindings[key]=mode;}
 const statuses=catalog.map(skill=>{
  const binding=conversation.skillBindings?.[skill.id]??conversation.skillBindings?.[skill.qualifiedId]??bindings[skill.id]??'auto';
  const reason=!skill.installed?'Not installed':!skill.enabled?'Disabled in the library':!skill.available?skill.unavailableReason??'Package unavailable':!skill.runtimeReady?'Runtime requirements unavailable':binding==='exclude'?'Excluded from this conversation':null;
  return {...skill,binding,preferred:binding==='include'||binding==='auto'&&(defaults.has(skill.id)||defaults.has(skill.qualifiedId)),effective:!reason,status:reason?'unavailable':'ready',reason};
 });
 const active=app.ephemeral.get('activeSkills:'+conversation.id) as {runId:string;skills:Map<string,string>}|undefined;
 if(active)for(const id of active.skills.keys())if(!id.startsWith('assistant:')&&!statuses.some(skill=>skill.id===id&&skill.effective))active.skills.delete(id);
 const loadedSkillIds=active?[...active.skills.keys()].filter(id=>statuses.some(skill=>skill.id===id&&skill.effective)):[];
 const requirementIds=new Set<string>();for(const preset of [selected,workflow]){if(preset?.id==='office')requirementIds.add('office');if(preset?.id==='pdf')requirementIds.add('pdf');if(preset?.id==='browser')requirementIds.add('browser');if(preset?.id==='coding')requirementIds.add('terminal');}
 const runtimeRequirements=[...requirementIds].map(id=>{if(id==='office'||id==='pdf'){const runtime=app.ephemeral.get(id==='office'?'officeRuntime':'documentRuntime');const state=runtime?.snapshot();return {id,name:id==='office'?'OfficeCLI':'PDF worker',status:state?.ready?'ready':state?.status==='failed'?'setup required':state?.status==='installing'?'installing':'setup on first use',detail:state?.error??(id==='office'?'OfficeCLI only; no Python Office fallback':'Separate local PDF implementation')};}const native=app.ephemeral.get('nativeBridge'),web=app.ephemeral.get('webBrowser');return {id,name:id==='browser'?'Interactive browser':'Terminal',status:id==='browser'&&(native?.browser||web)||id==='terminal'&&(native?.terminal||app.runtime?.ready)?'available':'connection required',detail:'Host availability and permissions are checked when an action runs'};});
 return {runtimeRequirements,skills:statuses.filter(skill=>skill.effective).sort((a,b)=>Number(b.preferred)-Number(a.preferred)),statuses:statuses.map(skill=>({...skill,loaded:loadedSkillIds.includes(skill.id)})),bindings,assistant:selected,assistants,workflowPresetId:workflow?.id??null,loadedSkillIds,activeRunId:active?.runId??null};
}

export async function validateConversationSkillConfiguration(app:AppContext,conversation:any){
 const catalog=await loadCatalog(app),ids=new Set(catalog.flatMap(skill=>[skill.id,skill.qualifiedId,...(skill.aliases??[])]));
 const previous=typeof conversation.id==='string'?(app.store.get('conversations',conversation.id)??app.ephemeral.get(conversation.id)??{}):{};const previousBindings=conversationSkillBindings(previous);
 if(conversation.skillBindings!==undefined){const bindings=z.record(z.string().min(1).max(1000),z.enum(['auto','include','exclude'])).parse(conversation.skillBindings);if(Object.keys(bindings).length>500)throw new Error('Too many conversation skill bindings');for(const [id,binding] of Object.entries(bindings))if(!ids.has(id)&&previousBindings[id]!==binding&&!(binding==='exclude'&&Object.hasOwn(previousBindings,id)))throw new Error('Unknown registered skill: '+id);}
 if(conversation.skillIds!==undefined){const legacy=z.array(z.string()).max(500).parse(conversation.skillIds);for(const id of legacy)if(!ids.has(id)&&!previous.skillIds?.includes(id))throw new Error('Unknown registered skill: '+id);}
 const assistants=assistantCatalog(app);
 for(const key of ['assistantId','workflowPresetId'])if(conversation[key]!=null&&!assistants.some(item=>item.id===conversation[key])&&previous[key]!==conversation[key])throw new Error('Unknown assistant or workflow preset: '+conversation[key]);
 const canonical:Record<string,SkillBinding>={};
 for(const [id,mode] of Object.entries(conversationSkillBindings(conversation))){const skill=catalog.find(item=>item.id===id||item.qualifiedId===id||item.aliases?.includes(id));if(skill)canonical[skill.id]=mode;else if(Object.hasOwn(previousBindings,id))canonical[id]=mode;}
 // Explicit canonical IDs take precedence if a request contains both forms.
 for(const skill of catalog)if(conversation.skillBindings?.[skill.id])canonical[skill.id]=conversation.skillBindings[skill.id];
 return {...conversation,skillBindings:canonical};
}

export function registerConversationSkillRoutes(app:FastifyInstance,context:AppContext){
 const getConversation=(id:string)=>{const conversation=context.ephemeral.get(id)??context.store.get('conversations',id);if(!conversation){const error:any=new Error('Conversation not found');error.statusCode=404;throw error;}return conversation;};
 app.get('/api/conversations/:id/skills',async(request:any)=>resolveConversationSkills(context,getConversation(request.params.id)));
 app.patch('/api/conversations/:id/skills',async(request:any)=>{
  const body=z.object({skillBindings:z.record(z.string(),z.enum(['auto','include','exclude'])).optional(),assistantId:z.string().nullable().optional(),workflowPresetId:z.string().nullable().optional()}).strict().parse(request.body);
  const previous=getConversation(request.params.id);
  // PATCH merges individual overrides; choosing Auto explicitly clears inherited Include.
  const next=await validateConversationSkillConfiguration(context,{...previous,...body,skillBindings:{...conversationSkillBindings(previous),...body.skillBindings}});
  if(body.assistantId){const preset=assistantCatalog(context).find(item=>item.id===body.assistantId);if(preset?.providerId)next.providerId=preset.providerId;if(preset?.model)next.model=preset.model;}if(next.incognito)context.ephemeral.set(next.id,next);else context.store.put('conversations',next);
  const active=context.ephemeral.get('activeSkills:'+next.id) as {skills:Map<string,string>}|undefined;
  if(active&&body.assistantId!==undefined){for(const id of active.skills.keys())if(id.startsWith('assistant:'))active.skills.delete(id);const assistant=assistantCatalog(context).find(item=>item.id===(next.assistantId??'general'));if(assistant?.instructions)active.skills.set('assistant:'+assistant.id,'Assistant workflow guidance (never grants permissions):\n'+assistant.instructions);}
  return resolveConversationSkills(context,next);
 });
 app.get('/api/assistants',async()=>assistantCatalog(context));
 const input=z.object({name:z.string().trim().min(1).max(100),description:z.string().max(2000).default(''),instructions:z.string().max(20000).default(''),skillIds:z.array(z.string()).max(100).default([]),providerId:z.string().max(200).optional(),model:z.string().max(300).optional(),toolNames:z.array(z.string().min(1).max(200)).max(300).optional()}).strict();
 const saveAssistant=async(body:any,id:string)=>{const parsed=input.parse(body),catalog=await loadCatalog(context);for(const name of parsed.toolNames??[])if(!(app as any).tools?.tools.has(name))throw new Error('Unknown registered tool or category: '+name);if(parsed.providerId&&!context.store.get('providers',parsed.providerId))throw new Error('Unknown provider connection');for(const skillId of parsed.skillIds)if(!catalog.some(skill=>skill.id===skillId||skill.qualifiedId===skillId))throw new Error('Unknown registered skill: '+skillId);return context.store.put('assistants',{id,...parsed,builtIn:false});};
 app.post('/api/assistants',async request=>saveAssistant(request.body,randomUUID()));
 app.put('/api/assistants/:id',async(request:any)=>{if(bundledAssistants.some(item=>item.id===request.params.id))throw new Error('Bundled assistants cannot be edited');if(!context.store.get('assistants',request.params.id))throw new Error('Assistant not found');return saveAssistant(request.body,request.params.id);});
 app.delete('/api/assistants/:id',async(request:any)=>{if(bundledAssistants.some(item=>item.id===request.params.id))throw new Error('Bundled assistants cannot be removed');context.store.delete('assistants',request.params.id);return {ok:true};});
}
