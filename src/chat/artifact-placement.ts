export function artifactAnchor(artifact:any,visible:any[],all:any[]):string|undefined{
 const creation=visible.filter(message=>message.role==='assistant'&&message.runId===artifact.creationRunId&&artifact.creationRunId);if(creation.length)return creation[creation.length-1].id;
 const toolIndex=all.findIndex(message=>{if(message.role!=='tool')return false;try{const result=JSON.parse(message.content);return result.data?.artifact?.id===artifact.id||(result.artifacts??[]).some((item:any)=>item.id===artifact.id);}catch{return false;}});
 if(toolIndex>=0){const next=all.slice(toolIndex+1).find(message=>visible.some(item=>item.id===message.id)&&message.role==='assistant');if(next)return next.id;for(let index=toolIndex-1;index>=0;index--)if(visible.some(item=>item.id===all[index].id))return all[index].id;}
 return visible.find(message=>message.role==='assistant')?.id??visible[0]?.id;
}
