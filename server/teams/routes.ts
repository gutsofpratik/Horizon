import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {AppContext} from '../app.ts';
import {Teams} from './service.ts';
import {isPlanReadTool} from '../agent/plan-approval.ts';
export function registerTeams(app:FastifyInstance,context:AppContext){const service=new Teams(context);context.ephemeral.set('teams',service);context.ephemeral.set('planReadTool',isPlanReadTool);app.addHook('onReady',async()=>service.startWorker());app.addHook('onClose',()=>service.close());
 app.get('/api/teams',()=>({teams:service.list()}));
 app.post('/api/teams',(request)=>service.create(request.body));
 app.get('/api/teams/:id',(request:any)=>service.snapshot(request.params.id));
 app.post('/api/teams/:id/tasks',(request:any)=>service.addTask(request.params.id,request.body));
 app.patch('/api/teams/:id/members/:member',(request:any)=>service.updateMember(request.params.id,request.params.member,request.body));
 app.post('/api/teams/:id/start',(request:any)=>service.start(request.params.id));
 app.post('/api/teams/:id/pause',(request:any)=>service.pause(request.params.id));
 app.post('/api/teams/:id/cancel',(request:any)=>service.pause(request.params.id,true));
 app.post('/api/teams/:id/tasks/:task/retry',(request:any)=>service.retry(request.params.id,request.params.task));
 app.post('/api/teams/:id/messages',(request:any)=>{const body=z.object({memberId:z.string().uuid(),text:z.string().min(1).max(20000)}).strict().parse(request.body);return service.message(request.params.id,'user',body.memberId,body.text);});
 app.get('/api/workspace/attention',()=>({approvals:[...context.ephemeral.entries()].filter(([key])=>key.startsWith('approval:')).map(([,item])=>item.record),plans:context.store.list('plan_gates').filter(p=>['awaiting_approval','changes_requested'].includes(p.status)),questions:context.store.list('questions').filter(q=>q.status==='pending')}));
}
