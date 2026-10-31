import {capabilityQuestion} from '../tools/intent-text.ts';
import {explicitFileTask} from '../tools/request-intent.ts';
import {continuationRequest,waitForNextMessage} from './continuation.ts';
const output=/\b(apps?|applications?|code files?|source files?|test files?|scripts?|reports?|roadmaps?|diagrams?|flowcharts?|mockups?|visuali[sz](?:e|ation)|artifacts?|interactive|html|plans?|schedules?|guides?|concepts?|present+ations?|slides?|powerpoint|pptx|pdf|documents?|spreadsheets?|xlsx|websites?|web app)\b/i;
const create=/\b(create|make|build|draft|turn|convert|design|improve|edit|update|revise|draw|add|remove|visuali[sz]e)\b[\s\S]{0,240}/i;
const decline=/^\s*(?:stop|pause|cancel|never\s?mind|forget (?:it|that)|no thanks)\b/i;
const proseOnly=/(?:no|don't|do not|without)[\s\S]{0,30}artifacts?|text only/i;
const question=/^\s*(?:explain|teach|how (?:do|can|to|does)|what (?:is|are|does)|why (?:is|are|does))\b/i;
function sourceEdit(text:string){if(!/\b[\w./-]+\.(?:mjs|cjs|jsx?|tsx?|py|rs|go|java|cs)\b/i.test(text))return false;for(const match of text.matchAll(/\b(?:write|fix|repair|refactor|edit|update|revise|implement)\b/ig))if(!/\b(?:do not|don't|never)\s*$/i.test(text.slice(Math.max(0,match.index!-24),match.index)))return true;return false;}

function published(message:any){if(message.role!=='tool')return false;try{const result=JSON.parse(message.content);return result.status==='succeeded'&&!!(result.artifacts?.length||result.files?.length||/^artifact_(create|update|patch|draft_finish)$/.test(message.tool_name??'')&&result.data?.artifact);}catch{return false;}}
/** Resolve an unfinished user deliverable across topic clarifications and approvals. */
export function deliverableIntent(branch:any[]):{required:boolean;task:string}{
 let last=branch.length-1;while(last>=0&&branch[last].role!=='user')last--;if(last<0)return {required:false,task:''};
 const latest=String(branch[last].content??'').replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g,'');if(capabilityQuestion(latest))return {required:false,task:latest};if(waitForNextMessage(latest))return {required:false,task:latest};if(decline.test(latest)||!explicitFileTask(latest)&&(proseOnly.test(latest)||question.test(latest)))return {required:false,task:latest};
 const direct=(text:string)=>!decline.test(text)&&(explicitFileTask(text)||(sourceEdit(text)||create.test(text)&&output.test(text))&&!proseOnly.test(text)&&!question.test(text));
 if(direct(latest))return {required:true,task:latest};
 const resolved=continuationRequest(branch.slice(0,last+1),latest);
 if(resolved!==latest&&direct(resolved)){const changed=/\b(add|remove|rename|adjust|improve|revise|update|create|build|write|finish|make)\b/i.test(latest.replace(/\bcre+a+t+e+\b/ig,'create'));const lastUserOutput=branch.slice(0,last).map((m,i)=>published(m)?i:-1).filter(i=>i>=0).at(-1);if(changed||lastUserOutput===undefined)return {required:true,task:resolved};}
 let index=last-1;while(index>=0&&!direct(String(branch[index].role==='user'?branch[index].content:'')))index--;
 if(index<0||branch.slice(index+1,last).some(message=>published(message)||message.role==='user'&&decline.test(String(message.content??''))))return {required:false,task:latest};
 const continuing=/^\s*(?:ok(?:ay|ie)?|yes|yep|yeah|sure|go ahead|continue|do it|proceed|sounds good|please)[.!\s]*$/i.test(latest)||output.test(latest);
 const previous=branch.slice(0,last).reverse().find(message=>message.role==='assistant');const clarification=/what (?:is |was |are |would |should )?(?:the |your )?(?:topic|subject|audience|style|format)|could you tell me/i.test(String(previous?.content??''));
 if(!continuing&&!clarification)return {required:false,task:latest};
 return {required:true,task:branch.slice(index,last+1).filter(message=>message.role==='user').map(message=>message.content).join('\n')};
}
