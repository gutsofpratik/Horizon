import {createHash} from 'node:crypto';

export interface CircuitCall {name:string;arguments?:unknown;argumentError?:string}
export interface CircuitResult {status:string;tool?:string;summary?:string;error?:{code?:string;message?:string};data?:{called_tool?:string;execution_outcome?:string}}
export interface CircuitDecision {action:'continue'|'correct'|'halt';reason?:'invalid_arguments'|'repeated_failure'|'all_error_rounds'|'discovery_cycle'|'protocol_failure';message?:string}
const validationCodes=new Set(['INVALID_ARGUMENTS','INVALID_TOOL_JSON','REPEATED_INVALID_ARGUMENTS']);
function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));
 return value;
}
export function callFingerprint(call:CircuitCall){return call.name+':'+createHash('sha256').update(JSON.stringify(canonical(call.arguments??{}))).digest('hex');}
function discovery(call:CircuitCall,result:CircuitResult){const name=result.data?.called_tool??call.name;return ['discover_tools','skills_list','skill_load','runtime_capabilities','list_tools','search_tools'].includes(name)||call.name==='toolkit'&&(call.arguments as any)?.action==='discover';}
/** Per-run recovery budget. Unrelated successes cannot reset a repeatedly failed operation. */
export class ToolCircuitBreaker {
 private failures=new Map<string,{count:number;message:string;invalid:boolean;uncertain:boolean}>();
 private round:Array<{call:CircuitCall;result:CircuitResult}>=[];
 private unproductive:string[]=[];
 private errorRounds=0;
 private discoveryRounds=0;
 private corrections=0;
 private protocolFailures=0;
 private successfulActions=0;
 private halted:CircuitDecision|undefined;
 beforeCall(call:CircuitCall):{code:string;message:string}|undefined{
  if(this.halted)return {code:'TOOL_CIRCUIT_OPEN',message:this.halted.message!};
  const previous=this.failures.get(callFingerprint(call));
  if(previous?.uncertain)return {code:'OUTCOME_UNKNOWN',message:'The earlier operation has an unknown execution outcome. Inspect its effects before attempting another write; this matching operation was not replayed. Previous error: '+previous.message};
  if(!previous||previous.count<2)return;
  return {code:previous.invalid?'REPEATED_INVALID_ARGUMENTS':'REPEATED_TOOL_FAILURE',message:'This identical failed call was blocked before execution. Previous error: '+previous.message+'. Correct the cause or choose another approach. Successful prior tool results remain valid; do not repeat completed operations.'};
 }
 observe(call:CircuitCall,result:CircuitResult){
  this.round.push({call,result});const key=callFingerprint(call);
  if(result.status==='succeeded'){
   this.failures.delete(key);
   if(!discovery(call,result)){this.successfulActions++;this.unproductive=[];this.protocolFailures=0;for(const [fingerprint,failure] of this.failures)if(failure.invalid&&fingerprint.startsWith(call.name+':'))this.failures.delete(fingerprint);}
  }else{
   const previous=this.failures.get(key);this.failures.set(key,{count:(previous?.count??0)+1,message:(result.error?.message??result.summary??'Unknown tool failure').slice(0,700),invalid:previous?.invalid??validationCodes.has(result.error?.code??''),uncertain:previous?.uncertain||result.error?.code==='OUTCOME_UNKNOWN'||result.data?.execution_outcome==='unknown'});
  }
  if(result.status!=='succeeded'||discovery(call,result))this.unproductive.push(key);
  this.unproductive=this.unproductive.slice(-36);
 }
 private decision(reason:NonNullable<CircuitDecision['reason']>,detail:string,halt:boolean):CircuitDecision{
  if(this.halted)return this.halted;
  const message='Tool recovery: '+detail+' '+this.successfulActions+' successful action(s) remain saved. Reuse successful results; do not repeat completed operations. '+(halt?'Tools are disabled for the next response. Tell the user what actually succeeded, what remains unfinished, and the precise blocker with a useful next step. Do not claim completion, invent results, or ask for information already in this chat.':'Correct the specific error using the offered schema, or use a different approach. Never emit an empty toolkit object. Call the failed function directly with its corrected named fields; do not wrap them in toolkit, name, action=call, or a JSON string. Discover only a missing operation; do not rediscover schemas already supplied. If the task is already complete, answer from the actual results.');
  if(halt){this.halted={action:'halt',reason,message};return this.halted;}
  if(this.corrections++>=2)return {action:'continue'};
  return {action:'correct',reason,message};
 }
 finishRound(options:{validationStreak?:number;protocolRepairs?:number}={}):CircuitDecision{
  if(this.halted)return this.halted;
  const round=this.round;this.round=[];if(!round.length)return {action:'continue'};
  const failed=round.filter(({result})=>result.status!=='succeeded');
  this.errorRounds=failed.length===round.length?this.errorRounds+1:0;
  this.discoveryRounds=round.every(({call,result})=>discovery(call,result))?this.discoveryRounds+1:0;
  const repeated=round.map(({call})=>this.failures.get(callFingerprint(call))).find(f=>f&&f.count>=(f.invalid?6:4));
  if((options.validationStreak??0)>=6)return this.decision('invalid_arguments','Recovery reached six consecutive invalid attempts. The model did not correct the tool arguments.',true);
  if(repeated)return this.decision('repeated_failure','The same operation failed '+repeated.count+' times: '+repeated.message,true);
  const errorRoundLimit=failed.every(({result})=>validationCodes.has(result.error?.code??''))?6:4;
  if(this.errorRounds>=errorRoundLimit)return this.decision('all_error_rounds','Every operation failed in '+this.errorRounds+' consecutive rounds. Latest error: '+(failed.at(-1)?.result.error?.message??'No successful tool result'),true);
  for(const period of [2,3]){
   const history=this.unproductive;if(history.length<period*3)continue;
   const tail=history.slice(-period);if(new Set(tail).size<2)continue;
   if([1,2].every(repeat=>tail.every((key,index)=>key===history[history.length-period*(repeat+1)+index])))return this.decision('discovery_cycle','The model repeated a '+period+'-operation discovery/failure cycle three times without a successful action.',true);
  }
  if(this.discoveryRounds>=6)return this.decision('discovery_cycle','Six discovery-only rounds produced no concrete action. The available schemas and skills have already been returned.',true);
  if(failed.length||this.discoveryRounds>=3)return this.decision(failed.length?'invalid_arguments':'discovery_cycle',failed.length?'Latest failed operation: '+(failed.at(-1)?.result.error?.message??failed.at(-1)?.result.summary??'No result'): 'Three discovery-only rounds produced no concrete action. Use the schemas and skills already returned.',false);
  return {action:'continue'};
 }
 protocolFailure(message:string,previousRepairs=0):CircuitDecision{
  this.protocolFailures=Math.max(this.protocolFailures,previousRepairs)+1;
  return this.decision('protocol_failure','The model returned an incomplete or malformed tool protocol ('+this.protocolFailures+' attempt(s)): '+message.slice(0,700),this.protocolFailures>=3);
 }
}
