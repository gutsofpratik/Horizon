export function responsePhases(message:any,activities:any[]=[]){
 const phases:any[]=[];
 for(const round of message.rounds??[message]){
  const afterDelivery=!!round.content?.trim()&&((round.tool_calls?.length??0)>0||activities.some(item=>item.messageId===round.id&&(!item.runId||item.runId===round.runId)));
  const parts=afterDelivery?[{...round,status:'completed',toolMessageIds:[],renderKey:round.id},{...round,content:'',reasoning:'',toolMessageIds:[round.id],renderKey:round.id+'-tools'}]:[{...round,toolMessageIds:[round.id],renderKey:round.id}];
  for(const part of parts){
  const previous=phases.at(-1);
  if(previous&&!previous.content){phases[phases.length-1]={...part,renderKey:previous.renderKey,messageIds:[...new Set([...previous.messageIds,round.id])],toolMessageIds:[...new Set([...previous.toolMessageIds,...part.toolMessageIds])],content:[previous.content,part.content].filter(Boolean).join('\n\n'),reasoning:[previous.reasoning,part.reasoning].filter(Boolean).join('\n\n')};}
  else phases.push({...part,messageIds:[round.id]});
  }
 }
 for(const phase of phases)if(phase.status==='generating')phase.status='completed';
 if(phases.length&&message.status==='generating')phases[phases.length-1].status='generating';
 return phases;
}
