import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {AppContext} from '../app.ts';
import {ToolError,type ToolRegistry,type ToolContext} from './registry.ts';

const condition=z.object({path:z.string().max(200),operator:z.enum(['exists','eq','ne','contains','gt','gte','lt','lte']),value:z.union([z.string().max(2000),z.number(),z.boolean(),z.null()]).optional()}).strict();
function matches(value:any,rule:z.infer<typeof condition>){
 for(const segment of rule.path.split('.').filter(Boolean)){if(['__proto__','constructor','prototype'].includes(segment)||!value||typeof value!=='object'||!Object.hasOwn(value,segment)){value=undefined;break;}value=value[segment];}
 if(rule.operator==='exists')return value!==undefined;
 if(rule.value===undefined)throw new ToolError('INVALID_CONDITION','Supply a comparison value');
 if(rule.operator==='eq')return value===rule.value;if(rule.operator==='ne')return value!==rule.value;
 if(rule.operator==='contains')return typeof value==='string'&&typeof rule.value==='string'&&value.includes(rule.value);
 if(typeof value!=='number'||typeof rule.value!=='number')return false;
 return rule.operator==='gt'?value>rule.value:rule.operator==='gte'?value>=rule.value:rule.operator==='lt'?value<rule.value:value<=rule.value;
}
export class Triggers{
 constructor(private app:AppContext){}
 list(conversationId:string){return this.app.store.list('triggers').filter(item=>item.conversationId===conversationId);}
 async event(event:'run.completed'|'webhook.received',payload:any){
  // A trigger must never recursively react to a run started by another trigger.
  if(event==='run.completed'&&this.app.store.list('message_queue').some(job=>job.runId===payload.runId&&job.input?.triggerOccurrence))return;
  for(const trigger of this.app.store.list('triggers').filter(item=>item.enabled&&item.event===event)){
   if(event==='run.completed'&&trigger.conversationId!==payload.conversationId||event==='webhook.received'&&trigger.webhookId!==payload.hookId)continue;
   if(Date.now()-(trigger.lastRunAt??0)<trigger.cooldownSeconds*1000)continue;
   if(trigger.condition){try{if(!matches(payload,trigger.condition))continue;}catch(error){this.app.store.put('triggers',{...trigger,enabled:false,error:(error as Error).message});continue;}}
   const conversation=this.app.store.get('conversations',trigger.conversationId),queue=this.app.ephemeral.get('messageQueue');
   if(!conversation||conversation.incognito||!queue)continue;
   const occurrence=trigger.id+':'+String(payload.id??payload.runId);if(this.app.store.list('message_queue').some(job=>job.input?.triggerOccurrence===occurrence))continue;
   try{const settings:Record<string,any>=this.app.store.get('settings','main')??{};const result=queue.enqueue({conversationId:trigger.conversationId,content:trigger.prompt,model:conversation.model??settings.model,providerId:conversation.providerId??settings.providerId,edition:trigger.edition,triggerOccurrence:occurrence,approvalMode:trigger.approvalMode});const count=(trigger.runCount??0)+1;this.app.store.put('triggers',{...trigger,runCount:count,lastRunAt:Date.now(),lastQueueId:result.queueId,enabled:count<trigger.maxRuns,error:undefined});}
   catch(error){this.app.store.put('triggers',{...trigger,enabled:false,error:(error as Error).message});}
  }
 }
}
function service(ctx:ToolContext){if(ctx.incognito)throw new ToolError('PRIVATE_TRIGGER_UNAVAILABLE','Persistent triggers require a saved chat');const triggers=ctx.app.ephemeral.get('triggers');if(!triggers)throw new ToolError('TRIGGERS_UNAVAILABLE','Trigger service is unavailable');return triggers as Triggers;}
export function registerTriggerTools(registry:ToolRegistry){
 registry.register({name:'trigger_condition',capability:'conversation',description:'Evaluate a bounded condition against supplied JSON without running code. Dotted path accesses only own properties; comparisons use exact types.',input:z.object({value:z.json(),condition}).strict(),handler:args=>{if(JSON.stringify(args.value).length>200000)throw new ToolError('DATA_TOO_LARGE','Condition input exceeds 200,000 characters');return {matches:matches(args.value,args.condition)};}});
 registry.register({name:'trigger_create',capability:'conversation',description:'Create a user-requested event-triggered task in this saved chat. Supports this chat run.completed or an existing authorized webhook.received event. Optional JSON condition filters events. Runs only while OpenClaude is running, defaults to one execution, and never reacts recursively to triggered runs. The fixed prompt executes with normal action approvals; event payload is not used as instructions.',input:z.object({name:z.string().min(1).max(120),event:z.enum(['run.completed','webhook.received']),webhook_id:z.string().uuid().optional(),prompt:z.string().min(1).max(20000),condition:condition.optional(),cooldown_seconds:z.number().int().min(60).max(86400).default(60),max_runs:z.number().int().min(1).max(20).default(1)}).strict(),handler:(args,ctx)=>{service(ctx);if(args.condition&&args.condition.operator!=='exists'&&args.condition.value===undefined)throw new ToolError('INVALID_CONDITION','Comparison conditions require value');if(!ctx.app.store.get('conversations',ctx.conversationId))throw new Error('Saved conversation required');if(args.event==='webhook.received'){const hook=ctx.app.store.get('webhooks',args.webhook_id??'');if(!hook?.enabled||!hook.allowAgentCalls)throw new ToolError('WEBHOOK_UNAVAILABLE','Select an enabled saved webhook authorized for agent use');}else if(args.webhook_id)throw new ToolError('INVALID_ARGUMENTS','webhook_id is only for webhook.received');if(service(ctx).list(ctx.conversationId).filter(item=>item.enabled).length>=20)throw new ToolError('TRIGGER_LIMIT','At most 20 active triggers per chat');return {trigger:ctx.app.store.put('triggers',{id:randomUUID(),name:args.name,event:args.event,webhookId:args.webhook_id,prompt:args.prompt,condition:args.condition,cooldownSeconds:args.cooldown_seconds,maxRuns:args.max_runs,runCount:0,enabled:true,conversationId:ctx.conversationId,edition:ctx.edition,approvalMode:ctx.approvalMode??'ask',createdAt:new Date().toISOString()}),requiresRunningApp:true};}});
 registry.register({name:'trigger_list',capability:'conversation',description:'List saved event triggers, counts, status and errors for this chat.',input:z.object({}).strict(),handler:(_args,ctx)=>({triggers:service(ctx).list(ctx.conversationId)})});
 registry.register({name:'trigger_update',capability:'conversation',description:'Enable or disable an existing trigger in this chat. Increasing a run limit or changing instructions requires creating a replacement trigger.',input:z.object({trigger_id:z.string().uuid(),enabled:z.boolean()}).strict(),handler:(args,ctx)=>{const item=service(ctx).list(ctx.conversationId).find(value=>value.id===args.trigger_id);if(!item)throw new Error('Trigger not found');if(args.enabled&&item.runCount>=item.maxRuns)throw new Error('Trigger execution limit reached');return {trigger:ctx.app.store.put('triggers',{...item,enabled:args.enabled})};}});
 registry.register({name:'trigger_delete',capability:'conversation',description:'Delete a saved event trigger in this chat. Already queued work is cancelled separately through queue tools.',input:z.object({trigger_id:z.string().uuid()}).strict(),handler:(args,ctx)=>{if(!service(ctx).list(ctx.conversationId).some(item=>item.id===args.trigger_id))throw new Error('Trigger not found');ctx.app.store.delete('triggers',args.trigger_id);return {deleted:true};}});
}
