import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {ToolRegistry,ToolError,type ToolContext} from './registry.ts';
import type {AppContext} from '../app.ts';
const input=z.object({questions:z.array(z.object({id:z.string().min(1).max(60),question:z.string().min(1).max(1000),options:z.array(z.object({label:z.string().min(1).max(100),description:z.string().max(300).optional()})).min(2).max(4)}).strict()).min(1).max(3)}).strict();
const key=(runId:string)=>'pending-question:'+runId;
export function pendingQuestion(app:AppContext,runId:string){return app.ephemeral.get(key(runId))?.record??null;}
export function answerQuestion(app:AppContext,runId:string,questionId:string,answers:Record<string,string>){
 const pending=app.ephemeral.get(key(runId));if(!pending||pending.record.id!==questionId||pending.record.status!=='pending')throw new ToolError('QUESTION_NOT_PENDING','This question is no longer waiting for an answer');
 if(!answers||typeof answers!=='object'||Array.isArray(answers)||Object.keys(answers).some(id=>!pending.record.questions.some((q:any)=>q.id===id)))throw new ToolError('INVALID_ANSWER','Answer only the requested questions');
 for(const question of pending.record.questions){const value=answers[question.id];if(typeof value!=='string'||!value.trim()||value.length>2000)throw new ToolError('INVALID_ANSWER','Provide an answer for each question (up to 2000 characters)');}
 pending.record.status='answered';pending.resolve({...answers});return {ok:true};
}
export function registerQuestionTool(registry:ToolRegistry){registry.register({name:'ask_user',capability:'conversation',description:'Ask 1–3 focused clarification questions with 2–4 selectable options and free-text answers. Waits for the actual user response. Use only when a meaningful missing preference blocks progress; never ask to repeat source already in this chat.',input,handler:async(args,ctx:ToolContext)=>{
 if(new Set(args.questions.map((q:any)=>q.id)).size!==args.questions.length)throw new ToolError('INVALID_ARGUMENTS','Question IDs must be unique');
 if(!ctx.runId||ctx.runId.startsWith('manual:'))throw new ToolError('RUN_REQUIRED','Questions require an active model conversation');
 const record={id:randomUUID(),runId:ctx.runId,conversationId:ctx.conversationId,messageId:ctx.messageId,questions:args.questions,status:'pending',createdAt:new Date().toISOString()};
 const save=(status:string,answers?:any)=>{if(!ctx.incognito)ctx.app.store.put('questions',{...record,status,answers});};
 save('pending');ctx.emit('question.requested',record);
 try{return await new Promise((resolve,reject)=>{
  const abort=()=>{record.status='cancelled';reject(new ToolError('CANCELLED','Question cancelled without an answer'));};
  const finish=(answers:any)=>{ctx.signal.removeEventListener('abort',abort);save('answered',answers);ctx.emit('question.answered',{id:record.id});resolve({questions:record.questions,answers,summary:'User answered the clarification questions'});};
  ctx.app.ephemeral.set(key(ctx.runId),{record,resolve:finish});ctx.signal.addEventListener('abort',abort,{once:true});if(ctx.signal.aborted)abort();
 });}catch(error){save('cancelled');throw error;}finally{ctx.app.ephemeral.delete(key(ctx.runId));}
 }});}
