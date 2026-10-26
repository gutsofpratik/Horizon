import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {AppContext} from '../app.ts';
import {publicProvider} from '../providers/configuration.ts';
import {saveMemory} from '../storage/memory.ts';
import {parseOnboardingMemories} from './onboarding-memory.ts';
export function registerOnboarding(app:FastifyInstance,context:AppContext){
 const progress=(patch:Record<string,unknown>)=>context.store.put('onboarding',{...context.store.get('onboarding','main'),id:'main',...patch});
 app.get('/api/onboarding',async()=>({version:2,edition:process.env.OPENCLAUDE_DESKTOP_OWNED==='1'?'desktop':'web',platform:process.platform,arch:process.arch,providers:context.store.list('providers').map((provider:any)=>publicProvider(provider)),engine:await context.ephemeral.get('ecosystemEngine')?.snapshot(),office:await context.ephemeral.get('officeRuntime')?.snapshot(),pdf:await context.ephemeral.get('documentRuntime')?.snapshot(),modelRuntime:context.ephemeral.get('modelRuntime')?.continuity??null,completed:!!context.store.get('onboarding','main')?.completed,step:context.store.get('onboarding','main')?.step??1,name:context.store.get('settings','main')?.userName??'',age:context.store.get('settings','main')?.userAge??null,platformLimitations:process.platform==='linux'&&process.env.XDG_SESSION_TYPE==='wayland'?['Native computer input on Wayland is unavailable; browser and terminal use independent adapters.']:process.platform==='darwin'?['macOS computer control requires Accessibility and Screen Recording permission.']:[]}));
 app.post('/api/onboarding/details',request=>{
  const input=z.object({name:z.string().trim().max(80).optional(),age:z.number().int().min(1).max(120).nullable().optional(),skipped:z.boolean().default(false)}).strict().parse(request.body);
  if(!input.skipped){const settings=context.store.get('settings','main')??{id:'main'};context.store.put('settings',{...settings,...(input.name?{userName:input.name}:{}),...(input.age!==undefined?{userAge:input.age}:{})});if(input.name)saveMemory(context.store,'My name is '+input.name,undefined,'onboarding','profile-name');if(input.age)saveMemory(context.store,'I was '+input.age+' years old on '+new Date().toISOString().slice(0,10)+'.',undefined,'onboarding','profile-age');}
  return progress({step:2});
 });
 app.post('/api/onboarding/memories',request=>{
  const input=z.object({text:z.string().max(50000),preview:z.boolean().default(false)}).strict().parse(request.body);
  const facts=parseOnboardingMemories(input.text);
  if(input.preview)return {memories:facts};
  let saved=0;for(const fact of facts){if(!saveMemory(context.store,fact,undefined,'onboarding-import').deduplicated)saved++;}
  progress({step:3});return {saved,total:facts.length};
 });
 app.post('/api/onboarding/complete',(request)=>{const input=z.object({providerId:z.string().optional(),model:z.string().optional(),skipped:z.boolean().default(false)}).strict().parse(request.body);if(!input.skipped&&(!input.providerId||!context.store.get('providers',input.providerId)||!input.model))throw new Error('Choose a configured provider and model, or skip setup');return progress({...input,step:4,completed:true,completedAt:new Date().toISOString()});});
}
