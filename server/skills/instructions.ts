import {createHash} from 'node:crypto';
/** Page original text for inference without editing the installed source file. */
export function skillInstructionPage(text:string,offset=0,characters=16000){
 const start=Math.min(text.length,Math.max(0,Math.trunc(offset)));
 let end=Math.min(text.length,start+Math.max(256,Math.trunc(characters)));
 if(end<text.length){const newline=text.lastIndexOf('\n',end);if(newline>start+characters/2)end=newline+1;}
 if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1]))end--;
 if(start>0&&/[\uDC00-\uDFFF]/.test(text[start])&&/[\uD800-\uDBFF]/.test(text[start-1]))throw Error('Skill resource offset splits a Unicode character');
 return {text:text.slice(start,end),offset:start,nextOffset:end<text.length?end:null,truncated:end<text.length,totalCharacters:text.length};
}
export const skillInstructionPrefix=(name:string,instructions:string)=>'Loaded installed skill '+name+' [instructions_sha256:'+createHash('sha256').update(instructions).digest('hex')+']:\n';
/** Only omit instructions when that exact content still exists in the branch. */
export function skillInstructionAlreadyPresent(id:string,instructions:string,messages:any[]){return messages.some(message=>{if(message.role!=='tool'||message.tool_name!=='skill_load')return false;try{const result=JSON.parse(message.content);return result.status==='succeeded'&&result.data?.skill?.id===id&&typeof result.data.instructions==='string'&&instructions.startsWith(skillInstructionPrefix(String(result.data.skill.name),result.data.instructions));}catch{return false;}});}
