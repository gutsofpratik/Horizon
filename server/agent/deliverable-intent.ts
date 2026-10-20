const output=/\b(roadmaps?|diagrams?|flowcharts?|mockups?|visuali[sz](?:e|ation)|artifacts?|interactive|html|plans?|schedules?|guides?|concepts?|present+ations?|slides?|powerpoint|pptx|pdf|documents?|spreadsheets?|xlsx|websites?|web app)\b/i;
const create=/\b(create|make|build|draft|turn|convert|design|improve|edit|update|revise|draw|visuali[sz]e)\b[\s\S]{0,240}/i;
const decline=/^\s*(?:stop|pause|cancel|never\s?mind|forget (?:it|that)|no thanks)\b/i;
const proseOnly=/(?:no|don't|do not|without)[\s\S]{0,30}artifacts?|text only/i;
const question=/^\s*(?:explain|teach|how (?:do|can|to|does)|what (?:is|are|does)|why (?:is|are|does))\b/i;
function published(message:any){if(message.role!=='tool')return false;try{const result=JSON.parse(message.content);return result.status==='succeeded'&&!!(result.artifacts?.length||result.files?.length||/^artifact_(create|update|patch|draft_finish)$/.test(message.tool_name??'')&&result.data?.artifact);}catch{return false;}}
/** Resolve an unfinished user deliverable across topic clarifications and approvals. */
export function deliverableIntent(branch:any[]):{required:boolean;task:string}{
 let last=branch.length-1;while(last>=0&&branch[last].role!=='user')last--;if(last<0)return {required:false,task:''};
 const latest=String(branch[last].content??'').replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g,'');if(decline.test(latest)||proseOnly.test(latest)||question.test(latest))return {required:false,task:latest};
 const direct=(text:string)=>create.test(text)&&output.test(text)&&!proseOnly.test(text)&&!question.test(text)&&!decline.test(text);
 if(direct(latest))return {required:true,task:latest};
 let index=last-1;while(index>=0&&!direct(String(branch[index].role==='user'?branch[index].content:'')))index--;
 if(index<0||branch.slice(index+1,last).some(message=>published(message)||message.role==='user'&&decline.test(String(message.content??''))))return {required:false,task:latest};
 const continuing=/^\s*(?:ok(?:ay|ie)?|yes|yep|yeah|sure|go ahead|continue|do it|proceed|sounds good|please)[.!\s]*$/i.test(latest)||output.test(latest);
 const previous=branch.slice(0,last).reverse().find(message=>message.role==='assistant');const clarification=/what (?:is |was |are |would |should )?(?:the |your )?(?:topic|subject|audience|style|format)|could you tell me/i.test(String(previous?.content??''));
 if(!continuing&&!clarification)return {required:false,task:latest};
 return {required:true,task:branch.slice(index,last+1).filter(message=>message.role==='user').map(message=>message.content).join('\n')};
}
