/** Keep stored rounds intact, but present consecutive rounds from a run as one response. */
export function responseGroups(messages:any[],activeRunId?:string){
 const groups:any[]=[];
 for(const message of messages){
  const previous=groups.at(-1);
  if(message.role==='assistant'&&message.runId&&previous?.role==='assistant'&&previous.runId===message.runId){
   groups[groups.length-1]={...message,rounds:[...previous.rounds,message],messageIds:[...previous.messageIds,message.id],renderKey:previous.renderKey,firstMessageId:previous.firstMessageId,content:[previous.content,message.content].filter(Boolean).join('\n\n'),reasoning:[previous.reasoning,message.reasoning].filter(Boolean).join('\n\n'),latestContent:message.content,status:activeRunId===message.runId?'generating':message.status};
  }else groups.push({...message,rounds:[message],messageIds:[message.id],renderKey:message.id,firstMessageId:message.id,latestContent:message.content,status:message.role==='assistant'&&activeRunId===message.runId&&activeRunId?'generating':message.status});
 }
 return groups;
}
