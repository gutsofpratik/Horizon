export function artifactPhase(artifact:any,phases:any[],all:any[]){
 let messageId=artifact.creationMessageId;
 if(!messageId){const tool=all.find(message=>{if(message.role!=='tool')return false;try{const data=JSON.parse(message.content);return data.data?.artifact?.id===artifact.id||(data.artifacts??[]).some((item:any)=>item.id===artifact.id);}catch{return false;}});messageId=tool?.parentId;const seen=new Set();while(messageId&&!seen.has(messageId)){seen.add(messageId);const parent=all.find(message=>message.id===messageId);if(parent?.role!=='tool')break;messageId=parent.parentId;}}
 const index=phases.findIndex(phase=>(phase.toolMessageIds??phase.messageIds)?.includes(messageId));return index<0?0:index;
}
