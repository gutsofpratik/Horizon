export type MentionQuery={kind:'tool'|'skill';query:string;start:number;end:number};
export function mentionQuery(text:string,caret:number):MentionQuery|null{
 const before=text.slice(0,caret),match=/(?:^|\s)([/@])([^\s/@]*)$/.exec(before);
 if(!match)return null;
 const start=caret-match[2].length-1;
 // A marker inside a fenced code sample should remain ordinary text.
 if((text.slice(0,start).match(/```/g)?.length??0)%2)return null;
 return {kind:match[1]==='/'?'tool':'skill',query:match[2],start,end:caret};
}
export function insertMention(text:string,query:MentionQuery,name:string){
 const token=(query.kind==='tool'?'/':'@')+(/\s/.test(name)?JSON.stringify(name):name);
 const tail=text.slice(query.end).replace(/^\S*/,'');
 const gap=tail.startsWith(' ')?'':' ';
 return {text:text.slice(0,query.start)+token+gap+tail,caret:query.start+token.length+1};
}
