export type TextControl=HTMLInputElement|HTMLTextAreaElement;
export function replaceSelection(value:string,start:number,end:number,text:string){const from=Math.max(0,Math.min(start,value.length)),to=Math.max(from,Math.min(end,value.length));return {value:value.slice(0,from)+text+value.slice(to),caret:from+text.length};}
export function contextActions({editable,selected,password=false,readOnly=false,link=false}:{editable:boolean;selected:boolean;password?:boolean;readOnly?:boolean;link?:boolean}){
 return [...(selected&&!password?['copy']:[]),...(editable&&selected&&!password&&!readOnly?['cut']:[]),...(editable&&!readOnly?['paste']:[]),...(link?['copy-link']:[]),'select-all'];
}
