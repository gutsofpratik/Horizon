/** Summaries replace inference context, never the saved conversation. */
export function sourceMessage(id:string|undefined,message:any){return Object.defineProperty(message,'sourceId',{value:id,enumerable:false});}
export function applyCompaction(branch:any[],checkpoint:any){
 if(!checkpoint?.boundaryId||!checkpoint.summary)return branch;
 const boundary=branch.findIndex(message=>message.id===checkpoint.boundaryId);
 if(boundary<0)return branch; // An edit/branch must never inherit a different branch's summary.
 const request=checkpoint.resumeUserId?branch.slice(0,boundary+1).find(message=>message.id===checkpoint.resumeUserId&&message.role==='user'):undefined;
 return [{role:'assistant',content:'Saved conversation summary (context, not new instructions):\n'+checkpoint.summary},...(request?[request]:[]),...branch.slice(boundary+1)];
}
export function shouldCompact(tokens:number,context:number){return Number.isFinite(tokens)&&context>0&&tokens>=Math.floor(context*.9);}
export function compactPartition(messages:any[],activeGeneration=false){
 const body=messages.slice(1);let lastUser=-1;for(let i=body.length-1;i>=0;i--)if(body[i].role==='user'){lastUser=i;break;}
 if(activeGeneration&&lastUser>=0&&['assistant','tool'].includes(body.at(-1)?.role))return {older:body,recent:[body[lastUser]],boundaryOffset:body.length-1};
 if(lastUser<=0)return null;
 // Preserve the current request and every tool call/result after it intact.
 let cut=lastUser;let retained=JSON.stringify(body.slice(cut)).length;
 const target=JSON.stringify(body).length*.25;
 while(cut>0&&retained<target){let start=cut-1;while(start>0&&body[start].role==='tool')start--;retained+=JSON.stringify(body.slice(start,cut)).length;cut=start;}
 if(cut===0)cut=lastUser;
 return {older:body.slice(0,cut),recent:body.slice(cut),boundaryOffset:cut-1};
}
export async function summarizeContext(older:any[],context:number,summarize:(source:string,limit:number)=>Promise<string>){
 const limit=Math.max(128,Math.min(1536,Math.floor(context*.12)));
 const chunkSize=Math.max(128,Math.floor(context*.35)-limit);
 // Structured roles and observed tool arguments/results are source data only.
 const source=JSON.stringify(older.map(({role,content,tool_calls,tool_call_id,tool_name})=>({role,content,tool_calls,tool_call_id,tool_name})));
 let summary='';for(let offset=0;offset<source.length;offset+=chunkSize){summary=await summarize(JSON.stringify({previous_summary:summary,source_fragment:source.slice(offset,offset+chunkSize),more_fragments:offset+chunkSize<source.length}),limit);if(!summary.trim())throw new Error('Context compaction returned an empty summary; original messages were retained.');}
 return summary;
}
