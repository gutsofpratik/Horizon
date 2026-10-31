import {taskToolProfile} from '../tools/task-routing.ts';
import {normalizeTaskText,capabilityQuestion} from '../tools/intent-text.ts';
export function waitForNextMessage(text:string){for(const match of text.matchAll(/\b(?:wait|hold off)\b[\s\S]{0,100}\bnext (?:chat )?message\b/ig))if(!/(?:do not|don't|never)\s*$/i.test(text.slice(Math.max(0,match.index!-16),match.index)))return true;return false;}

/** Resolve a follow-up against this branch's task, never against another chat. */
export function continuationRequest(messages:any[],request:string){
 const normalize=(text:string)=>normalizeTaskText(text).toLowerCase().replace(/\bt+o+\b/g,'to').trim();
 const text=normalize(request);
 const stopped=/^(?:stop|pause|cancel|never mind|nevermind|forget (?:it|that)|new (?:task|topic))\b/i;
 if(stopped.test(text)||capabilityQuestion(text)||/^(?:hi|hello|hey|thanks|thank you|goodnight)[!.\s]*$/i.test(text))return request;
 const short=/^(?:(?:ok(?:ay|ie)?|yes|yep|yeah|sure|please|now|bro)[,!.\s]*)*(?:continue|go on|go ahead|try again|again|retry|proceed|do (?:it|that|this)|make it better|option\s*\d+|(?:yes|yep|yeah|sure|ok(?:ay|ie)?))[.!?\s]*$/i.test(text);
 const reference=/\b(it|that|this|same|previous|above|again|them|these)\b/.test(text)&&/\b(change|update|revise|edit|add|remove|adjust|make|fix|continue|improve|retry|keep|open|create|build|write|generate|finish|do|run|start|launch|execute|test|serve|host|boot|install)\b/.test(text);
 const previous=messages.slice(0,-1);const lastAssistant=[...previous].reverse().find(m=>m.role==='assistant'&&String(m.content??'').trim());
 const clarification=!/\b(?:search|research|create|build|write|open|stop|cancel|new task|instead)\b/i.test(text)&&text.length<200&&/\b(which|what|choose|pick|prefer|how many|would you like)\b[^?]*\?/i.test(String(lastAssistant?.content??''));
 const implicitEdit=/^(?:please\s+)?(?:add|remove|rename|adjust|improve|revise|update|change|edit|modify|retry|finish|continue)\b/i.test(text)&&taskToolProfile(request).length===0;
 if(!short&&!reference&&!clarification&&!implicitEdit)return request;
 const users=previous.filter(m=>m.role==='user').slice(-32);
 const instruction=/\b(create|make|build|implement|fix|debug|refactor|edit|write|design|generate|research|search|browse|open|convert|transcribe|analyze|analyse|use)\b/i;
 for(let i=users.length-1;i>=0;i--){const candidate=String(users[i].content??'');if(stopped.test(normalize(candidate)))break;
  const candidateReference=/\b(it|that|this|same|them|these|again)\b/i.test(candidate);
  if(taskToolProfile(candidate).length&&instruction.test(candidate)&&!candidateReference){const context=users.slice(i).map(m=>String(m.content??'')).join('\n').slice(0,7000);return context+'\nFollow-up: '+request;}
 }
 // Older branches may contain a named task without an imperative verb.
 for(let i=users.length-1;i>=0;i--){const candidate=String(users[i].content??'');if(stopped.test(normalize(candidate)))break;if(taskToolProfile(candidate).length)return candidate.slice(0,4000)+'\nFollow-up: '+request;}
 return request;
}
