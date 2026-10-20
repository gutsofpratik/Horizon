export function pagedConversation(page:any){return {...page.conversation,messages:[...page.messages,...(page.siblings??[])],messagePageHeadId:page.pagination.hasMoreAfter?page.messages.at(-1)?.id:undefined,messagePage:page.pagination};}
export function prependMessagePage(previous:any,page:any){
 const byId=new Map<string,any>();
 for(const message of [...page.messages,...(page.siblings??[]),...(previous.messages??[])]){const existing=byId.get(message.id);if(!existing||!message.messageIndexOnly)byId.set(message.id,message);}
 return {...previous,messages:[...byId.values()],messagePage:{...previous.messagePage,before:page.pagination.before,hasMoreBefore:page.pagination.hasMoreBefore,total:page.pagination.total}};
}
/** Copy the row list once and look up every delta in O(1). */
export function applyMessageDeltas(messages:any[],deltas:Map<string,{content:string;reasoning:string}>){
 const positions=new Map(messages.map((message,index)=>[message.id,index])),next=messages.slice();
 for(const [id,delta] of deltas){const index=positions.get(id);if(index===undefined)continue;const message=next[index];next[index]={...message,content:(message.content??'')+delta.content,reasoning:(message.reasoning??'')+delta.reasoning,...(delta.reasoning?{engineStage:'reasoning'}:delta.content?{engineStage:'decoding'}:{})};}
 return next;
}
export function acceptEventSequence(previous:number,event:any,lastEventId?:string){const value=Number(event.sequence??lastEventId);if(!Number.isSafeInteger(value)||value<=0)return {accepted:true,sequence:previous};return {accepted:value>previous,sequence:Math.max(previous,value)};}
export function completePagedConversation(previous:any,completed:any,runId:string){
 if(!previous?.messagePage)return completed;
 const visibleIds=new Set(previous.messages.filter((message:any)=>!message.messageIndexOnly).map((message:any)=>message.id));
 const byId=new Map<string,any>((completed.messages??[]).map((message:any)=>[message.id,message]));
 let total=0,id=completed.headId;const seen=new Set<string>();
 while(id&&!seen.has(id)){seen.add(id);const message=byId.get(id);if(!message)break;total++;id=message.parentId;}
 const messages=(completed.messages??[]).filter((message:any)=>visibleIds.has(message.id)||message.runId===runId);
 for(const message of previous.messages)if(message.messageIndexOnly&&!visibleIds.has(message.id))messages.push(message);
 return {...previous,...completed,messages,messagePage:{...previous.messagePage,total:completed.headId?total:completed.messages.length,storedTotal:completed.messages.length}};
}

export function mergeTerminalPage(previous:any,page:any){
 if(!previous?.messagePage)return pagedConversation(page);
 const byId=new Map<string,any>((previous.messages??[]).map((message:any)=>[message.id,message]));
 for(const message of [...(page.siblings??[]),...page.messages]){const current=byId.get(message.id);if(!message.messageIndexOnly||!current)byId.set(message.id,message);}
 return {...previous,...page.conversation,messagePageHeadId:undefined,messages:[...byId.values()],messagePage:{...page.pagination,before:previous.messagePage.before??page.pagination.before,hasMoreBefore:previous.messagePage.hasMoreBefore}};
}

export function appendMessagePage(previous:any,page:any){
 const byId=new Map<string,any>((previous.messages??[]).map((message:any)=>[message.id,message]));
 for(const message of [...(page.siblings??[]),...page.messages]){const existing=byId.get(message.id);if(!message.messageIndexOnly||!existing)byId.set(message.id,message);}
 return {...previous,...page.conversation,messages:[...byId.values()],messagePageHeadId:page.pagination.hasMoreAfter?page.messages.at(-1)?.id:undefined,messagePage:{...page.pagination,before:previous.messagePage.before,hasMoreBefore:previous.messagePage.hasMoreBefore}};
}
