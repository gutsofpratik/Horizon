import type {FastifyInstance} from 'fastify';import type {AppContext} from '../app.ts';import {Agent} from './orchestrator.ts';import {ToolRegistry} from '../tools/registry.ts';import {z} from 'zod';
import {readResearch,researchSnapshot,sourceInventory} from '../research/state.ts';
import {draftList} from '../artifacts/checkpoints.ts';
import {pendingQuestion,answerQuestion} from '../tools/questions.ts';
import {MessageQueue} from './message-queue.ts';
export function registerAgentRoutes(app:FastifyInstance,context:AppContext,tools:ToolRegistry){
 const agent=new Agent(context,tools);app.decorate('agent',agent);app.addHook('onClose',async()=>{for(const run of agent.states.values())agent.cancel(run.id);await Promise.all([...agent.tasks.values()]);});
 const queue=new MessageQueue(context,agent);context.ephemeral.set('messageQueue',queue);app.addHook('onClose',async()=>queue.close());
 context.ephemeral.set('agent',agent);
 app.get('/api/conversations/:id/queue',async(request:any)=>{if(!agent.conversation(request.params.id))throw new Error('Conversation not found');return {messages:queue.list(request.params.id)};});
 app.delete('/api/conversations/:id/queue/:job',async(request:any)=>({cancelled:queue.cancel(request.params.id,request.params.job)}));
 app.patch('/api/conversations/:id/queue/:job',async(request:any)=>queue.update(request.params.id,request.params.job,z.string().min(1).max(200000).parse(request.body.content)));
 app.post('/api/conversations/:id/queue/resume',async(request:any)=>queue.resume(request.params.id));
 const scopedResearch=(request:any)=>{const record=readResearch(context,request.params.id);return record&&record.conversationId===request.query.conversationId&&agent.conversation(record.conversationId)?record:undefined;};
 app.get('/api/research/:id',async(request:any,reply)=>{const record=scopedResearch(request);return record?researchSnapshot(record):reply.code(404).send({error:'Research not found in this conversation'});});
 app.get('/api/research/:id/inventory',async(request:any,reply)=>{const record=scopedResearch(request);if(!record)return reply.code(404).send({error:'Research not found in this conversation'});return reply.header('Content-Type','text/markdown; charset=utf-8').header('Content-Disposition','attachment; filename="research-sources.md"').send(sourceInventory(record));});
 app.get('/api/tools' ,async()=>tools.catalog());
 app.get('/api/artifact-drafts',async(request:any,reply)=>{const conversation=agent.conversation(String(request.query.conversationId??''));if(!conversation)return reply.code(404).send({error:'Conversation not found'});return {drafts:draftList(context,conversation.id,!!conversation.incognito)};});
 app.get('/api/artifact-drafts/:id',async(request:any,reply)=>{const conversation=agent.conversation(String(request.query.conversationId??''));const draft=conversation&&draftList(context,conversation.id,!!conversation.incognito).find(item=>item.id===request.params.id);if(!draft)return reply.code(404).send({error:'Draft not found in this conversation'});return draft;});
 const input=z.object({researchStrategy:z.enum(["standard","deep_search","deep_research"]).optional(),researchTarget:z.number().int().min(100).max(200).optional(),researchResumeId:z.string().optional(),content:z.string().max(200000).optional(),taskMode:z.enum(['chat','plan','goal','sketch','presentation','pdf','excel','slides','computer','browser']).optional(),mode:z.enum(['chat','cowork','code']).optional(),webSearchEnabled:z.boolean().optional(),conversationId:z.string().optional(),projectId:z.string().optional(),activeArtifactId:z.string().optional(),activeDraftId:z.string().optional(),providerId:z.string().optional(),model:z.string().max(300).optional(),incognito:z.boolean().optional(),thinking:z.boolean().optional(),toolsEnabled:z.boolean().optional(),useMemory:z.boolean().optional(),timeZone:z.string().max(100).optional(),skillIds:z.array(z.string()).max(10).optional(),enabledToolNames:z.array(z.string()).optional(),branchParentId:z.string().nullable().optional(),retryMessageId:z.string().optional(),attachments:z.array(z.any()).max(8).optional()}).strict();
 app.post('/api/runs',async(request)=>{const data={...input.parse(request.body),edition:request.headers['user-agent']?.includes('OpenClaudeDesktop')?'desktop':'web'};const chat=data.conversationId?agent.conversation(data.conversationId):undefined;return chat?.activeRunId&&agent.getRun(chat.activeRunId)?.status==='running'?queue.enqueue(data):agent.start(data);});
 app.get('/api/runs/:id',async(request:any,reply)=>{const run=agent.getRun(request.params.id);if(!run)return reply.code(404).send({error:'Run not found'});return {id:run.id,status:run.status,error:run.error,conversationId:run.conversationId};});
 app.post('/api/runs/:id/cancel',async(request:any)=>agent.cancel(request.params.id));
 app.get('/api/runs/:id/question',async(request:any)=>({question:pendingQuestion(context,request.params.id)}));
 app.post('/api/runs/:id/question',async(request:any)=>{const body=z.object({questionId:z.string(),answers:z.record(z.string(),z.string().min(1).max(2000))}).strict().parse(request.body);return answerQuestion(context,request.params.id,body.questionId,body.answers);});
 app.get('/api/runs/:id/log',async(request:any)=>agent.events(request.params.id));
 app.get('/api/runs/:id/events',async(request:any,reply)=>{
  const id=request.params.id;const run=agent.getRun(id);if(!run)return reply.code(404).send({error:'Run not found'});reply.hijack();reply.raw.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache',Connection:'keep-alive'});
  let cursor=Number(request.headers['last-event-id']??request.query.after??0);const write=(event:any)=>{if(event.sequence<=cursor||reply.raw.destroyed)return;cursor=event.sequence;reply.raw.write(`id: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`);};
  const listener=(event:any)=>{write(event);if(event.type==='run.completed')reply.raw.end();};agent.emitter.on(id,listener);for(const event of agent.events(id,cursor))write(event);if(run.status!=='running'){agent.emitter.off(id,listener);reply.raw.end();return;}const heartbeat=setInterval(()=>{if(!reply.raw.destroyed)reply.raw.write(': heartbeat\n\n');},10000);reply.raw.on('close',()=>{clearInterval(heartbeat);agent.emitter.off(id,listener);});
 });
 return agent;
}
