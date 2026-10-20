import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {AppContext} from '../app.ts';
import {Automations} from './service.ts';
export function registerAutomationWorkspace(app:FastifyInstance,context:AppContext){const service=new Automations(context);context.ephemeral.set('automations',service);app.addHook('onReady',async()=>service.start());app.addHook('onClose',async()=>service.close());
 app.get('/api/automations',()=>({jobs:service.list(),occurrences:service.history(),legacySchedules:context.ephemeral.get('scheduler')?.list()??[],requiresRunningApp:true,error:context.ephemeral.get('automationError')}));
 app.post('/api/automations',(request)=>service.save(request.body));
 app.put('/api/automations/:id',(request:any)=>{service.get(request.params.id);return service.save(request.body,request.params.id);});
 app.patch('/api/automations/:id',(request:any)=>service.toggle(request.params.id,z.object({enabled:z.boolean()}).strict().parse(request.body).enabled));
 app.post('/api/automations/:id/run',(request:any)=>service.dispatch(service.get(request.params.id),new Date().toISOString(),true));
 app.get('/api/automations/:id/history',(request:any)=>({occurrences:service.history(request.params.id)}));
 app.post('/api/automation-occurrences/:id/cancel',(request:any)=>service.cancel(request.params.id));
 app.get('/api/automations/queues/all',()=>({messages:context.store.list('message_queue').slice(0,200).map(({input,...row})=>({...row,content:input?.content})),webhookDeliveries:context.store.list('webhook_deliveries').slice(0,100)}));
}
