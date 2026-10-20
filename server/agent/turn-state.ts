export type TurnPhase='connecting'|'loading'|'processing_input'|'generating'|'executing_tools'|'awaiting_approval'|'awaiting_answers'|'stopping'|'completed'|'failed'|'interrupted';
export function nextTurnPhase(previous:TurnPhase|undefined,type:string,data:any):TurnPhase{
 if(type==='run.started')return 'connecting';
 if(type==='approval.requested'||type==='plan.proposed')return 'awaiting_approval';
 if(type==='question.requested')return 'awaiting_answers';
 if(type==='run.stopping')return 'stopping';
 if(type==='run.failed')return 'failed';
 if(type==='run.cancelled')return 'interrupted';
 if(type==='run.completed')return data.status==='completed'?'completed':data.status==='failed'?'failed':'interrupted';
 if(type==='tool.started'||type==='tool.preparing')return 'executing_tools';
 if(type==='model.delta'||type==='reasoning.delta')return 'generating';
 if(type==='approval.resolved'||type==='question.answered'||type==='plan.resolved')return 'executing_tools';
 if(type==='model.status'){if(['loading','loading_model','waiting_for_model'].includes(data.phase))return 'loading';if(['preparing','prefill','processing','processing_prompt','compacting'].includes(data.phase))return 'processing_input';if(['decoding','reasoning','generating'].includes(data.phase))return 'generating';if(data.phase==='working')return 'executing_tools';}
 return previous??'connecting';
}
