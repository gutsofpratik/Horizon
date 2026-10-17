import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {AppContext} from '../app.ts';
import {GoalService,goalInput,goalPatch} from './service.ts';
export function registerGoalRoutes(app:FastifyInstance,context:AppContext){
 const goals=new GoalService(context);context.ephemeral.set('goals',goals);
 app.addHook('onReady',async()=>goals.startPolling());app.addHook('onClose',async()=>goals.close());
 app.get('/api/conversations/:id/goals',async(request:any)=>({goals:goals.list(request.params.id),requiresRunningApp:true}));
 app.get('/api/conversations/:id/goals/:goal',async(request:any)=>goals.read(request.params.id,request.params.goal));
 app.post('/api/conversations/:id/goals',async(request:any)=>goals.create(request.params.id,goalInput.parse(request.body),request.headers['user-agent']?.includes('OpenClaudeDesktop')?'desktop':'web'));
 app.patch('/api/conversations/:id/goals/:goal',async(request:any)=>goals.update(request.params.id,request.params.goal,goalPatch.parse(request.body)));
 app.post('/api/conversations/:id/goals/:goal/:action',async(request:any)=>{const {id,goal}=request.params;switch(request.params.action){case 'start':case 'resume':return goals.start(id,goal);case 'pause':return goals.pause(id,goal);case 'complete':return goals.complete(id,goal,z.object({summary:z.string().trim().min(1).max(2000)}).strict().parse(request.body).summary);default:throw new Error('Unknown goal action');}});
 return goals;
}
