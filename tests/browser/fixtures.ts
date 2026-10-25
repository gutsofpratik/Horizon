import type {Route} from '@playwright/test';
export const conversationRoute=(id:string)=>(url:URL)=>url.pathname==='/api/entities/conversations/'+id||url.pathname==='/api/conversations/'+id+'/messages';
export function conversationResponse(route:Route,conversation:any){
 if(!new URL(route.request().url()).pathname.endsWith('/messages'))return conversation;
 return {conversation,messages:conversation.messages??[],siblings:[],pagination:{hasMoreBefore:false,hasMoreAfter:false,total:conversation.messages?.length??0,storedTotal:conversation.messages?.length??0}};
}
export const runState=(conversation:any)=>({messages:conversation.messages??[],sequence:0,phase:'thinking',activities:[],approvals:[],question:null});
