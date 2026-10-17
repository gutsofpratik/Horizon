export function responseActivities(message:any,all:any[],live:any[]=[]){
 const ids=new Set(message.toolMessageIds??message.messageIds??[message.id]);const tools:any[]=[];
 for(const round of all.filter(item=>ids.has(item.id))){
  for(const call of round.tool_calls??[]){
   let args:any={},result:any;try{args=typeof call.function.arguments==='string'?JSON.parse(call.function.arguments):call.function.arguments;}catch{}
   if(!args||typeof args!=='object'||Array.isArray(args))args={};
   const tool=all.find(item=>item.role==='tool'&&item.tool_call_id===call.id);
   try{if(tool)result=JSON.parse(tool.content);}catch{}
   if(call.function.name==='toolkit'){if(args.action==='discover'&&result?.status!=='failed')continue;const candidate=result?.data?.called_tool??(args.action==='call'?args.name:undefined);const name=typeof candidate==='string'?candidate:'tool_request';tools.push({callId:result?.data?.activity_call_id??call.id,name,arguments:args.arguments??{},result,gateway:true});}else tools.push({callId:call.id,name:call.function.name,arguments:args,result});
  }
 }
 for(const item of live.filter(item=>ids.size>0&&item.runId&&item.runId===message.runId&&(!item.messageId||ids.has(item.messageId)))){if(item.name==='toolkit')continue;let index=tools.findIndex(tool=>tool.callId===item.callId);if(index<0)index=tools.findIndex(tool=>tool.gateway&&!tool.liveMerged&&tool.name===item.name&&JSON.stringify(tool.arguments)===JSON.stringify(item.arguments??tool.arguments));if(index<0)tools.push(item);else tools[index]={...tools[index],...item,liveMerged:true};}
 return tools;
}

export function responseBranches(message:any,all:any[]){
 const first=all.find(item=>item.id===(message.firstMessageId??message.id));if(!first)return [];
 return all.filter(item=>item.role===first.role&&item.parentId===first.parentId).map(branch=>{
  if(branch.role!=='assistant')return branch;
  let last=branch;const visited=new Set<string>();
  while(!visited.has(last.id)){visited.add(last.id);const next=all.filter(item=>item.parentId===last.id&&(item.role==='tool'||item.role==='assistant'&&item.runId===branch.runId)).at(-1);if(!next)break;last=next;}
  return {...branch,id:last.id,firstMessageId:branch.id};
 });
}
