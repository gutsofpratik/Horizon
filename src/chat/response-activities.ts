const categoryPrefixes:Record<string,string>={artifact:'artifact',browser:'browser',computer:'computer',web:'web',documents:'document',pdf:'pdf',sheets:'spreadsheet',slides:'slides',planning:'plan'};
function routed(name:string,args:any){
 const prefix=categoryPrefixes[name];if(!prefix||typeof args.action!=='string')return {name,arguments:args};
 const {action,...rest}=args;const suffix=name==='artifact'&&['write','finish'].includes(action)?'draft_'+action:action;
 if(name==='browser'&&action==='tabs'){rest.action=rest.operation;delete rest.operation;}
 return {name:prefix+'_'+suffix,arguments:rest};
}
function sameArguments(a:any,b:any){const ordered=(value:any):any=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;return JSON.stringify(ordered(a))===JSON.stringify(ordered(b));}
export function responseActivities(message:any,all:any[],live:any[]=[]){
 const ids=new Set(message.toolMessageIds??message.messageIds??[message.id]);const tools:any[]=[];
 for(const round of all.filter(item=>ids.has(item.id))){
  for(const call of round.tool_calls??[]){
   let args:any={},result:any;try{args=typeof call.function.arguments==='string'?JSON.parse(call.function.arguments):call.function.arguments;}catch{}
   if(!args||typeof args!=='object'||Array.isArray(args))args={};
   const tool=all.find(item=>item.role==='tool'&&item.tool_call_id===call.id);
   try{if(tool)result=JSON.parse(tool.content);}catch{}
   const gateway=call.function.name==='toolkit';if(gateway&&args.action==='discover'&&result?.status!=='failed')continue;
   const requested=gateway?(args.action==='call'&&typeof args.name==='string'?args.name:'tool_request'):call.function.name;
   const routedCall=routed(requested,gateway?(args.arguments??{}):args);
   tools.push({callId:result?.data?.activity_call_id??call.id,...routedCall,name:result?.data?.called_tool??routedCall.name,result,gateway:gateway||!!categoryPrefixes[requested]});
  }
 }
 for(const item of live.filter(item=>ids.size>0&&item.runId&&item.runId===message.runId&&(!item.messageId||ids.has(item.messageId)))){
  // Family preparing events are placeholders; leaf events carry the execution state.
  if(item.name==='toolkit'||categoryPrefixes[item.name]&&!item.result)continue;
  let index=tools.findIndex(tool=>tool.callId===item.callId);
  if(index<0)index=tools.findIndex(tool=>tool.gateway&&!tool.liveMerged&&tool.name===item.name&&sameArguments(tool.arguments,item.arguments??tool.arguments));
  if(index<0)tools.push(item);else tools[index]={...tools[index],...item,liveMerged:true};
 }
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
