import {useCallback,useEffect,useRef,useState} from 'react';
import {Check,Flag,Pause,Play,X} from 'lucide-react';
import {api} from '../app/api';

type Goal={id:string;objective:string;status:string;runLimit:number;sessionRuns:number;totalRuns:number;reason?:string;lastRunId?:string;pendingQueueId?:string;steps:{at:string;text:string}[]};
type Props={conversationId:string;incognito?:boolean;onError:(error:string)=>void;onClose?:()=>void;onRun?:(job:any)=>void|Promise<void>;knownRunIds?:string[];running?:boolean};
export function GoalsPanel({conversationId,incognito,onError,onClose,onRun,knownRunIds=[],running=false}:Props){
 const [goals,setGoals]=useState<Goal[]>([]),[objective,setObjective]=useState(''),[runLimit,setRunLimit]=useState(5),[busy,setBusy]=useState(false),[editing,setEditing]=useState('');
 const callbacks=useRef({onError,onRun,knownRunIds,running});callbacks.current={onError,onRun,knownRunIds,running};const connecting=useRef(false);
 const refresh=useCallback(async()=>{const data=await api('/conversations/'+conversationId+'/goals');setGoals(data.goals);return data.goals as Goal[];},[conversationId]);
 useEffect(()=>{if(incognito||!conversationId)return;let current=true,polling=false;setGoals([]);const poll=async()=>{if(polling)return;polling=true;try{const data=await api('/conversations/'+conversationId+'/goals');if(!current)return;setGoals(data.goals);const goal=data.goals.find((item:Goal)=>item.lastRunId&&!callbacks.current.knownRunIds.includes(item.lastRunId));if(goal?.lastRunId&&callbacks.current.onRun&&!callbacks.current.running&&!connecting.current){connecting.current=true;try{await callbacks.current.onRun({runId:goal.lastRunId,conversationId});}finally{connecting.current=false;}}}catch(error){if(current)callbacks.current.onError((error as Error).message);}finally{polling=false;}};void poll();const timer=setInterval(poll,1200);return()=>{current=false;clearInterval(timer);};},[conversationId,incognito]);
 const change=async(path:string,method:string,body?:any)=>{setBusy(true);try{await api('/conversations/'+conversationId+'/goals'+path,{method,...(body?{body:JSON.stringify(body)}:{})});setObjective('');setEditing('');await refresh();window.dispatchEvent(new Event('message-queue-changed'));}catch(error){onError((error as Error).message);}finally{setBusy(false);}};
 return <section className="goals-panel" aria-label="Persistent goals" style={{padding:16,border:'1px solid var(--border)',borderRadius:12,margin:'8px 0',maxHeight:'60vh',overflowY:'auto'}}>
  <header style={{display:'flex',alignItems:'center',gap:8}}><Flag size={17}/><strong>Goals</strong>{onClose&&<button className="icon-button" style={{marginLeft:'auto'}} onClick={onClose} aria-label="Close goals"><X size={16}/></button>}</header>
  <p style={{fontSize:12,opacity:.75}}>Goals continue while the app is running. Each session pauses at its run limit. Restarting the app leaves goals paused.</p>
  {incognito?<p>Save a conversation to use persistent goals.</p>:!conversationId?<p>Start a conversation to add a goal.</p>:<>
   <form onSubmit={event=>{event.preventDefault();void change(editing?'/'+editing:'',editing?'PATCH':'POST',{objective,runLimit});}}>
    <textarea aria-label="Goal objective" placeholder="What should the assistant work toward?" value={objective} maxLength={20000} onChange={event=>setObjective(event.target.value)} rows={3} style={{width:'100%',resize:'vertical'}}/>
    <div style={{display:'flex',alignItems:'center',gap:8,marginTop:8}}><label>Run limit <input aria-label="Goal run limit" type="number" min={1} max={25} value={runLimit} onChange={event=>setRunLimit(Number(event.target.value))} style={{width:58}}/></label><button type="submit" disabled={busy||!objective.trim()||!Number.isInteger(runLimit)||runLimit<1||runLimit>25}>{editing?'Save goal':'Create goal'}</button>{editing&&<button type="button" onClick={()=>{setEditing('');setObjective('');}}>Cancel</button>}</div>
   </form>
   {goals.map(goal=><article key={goal.id} style={{borderTop:'1px solid var(--border)',marginTop:14,paddingTop:12}}>
    <p style={{whiteSpace:'pre-wrap',margin:'0 0 6px'}}>{goal.objective}</p><small>{goal.status} · {goal.sessionRuns}/{goal.runLimit} responses this session · {goal.totalRuns} total</small>
    {goal.reason&&<p role="status" style={{fontSize:12,margin:'6px 0'}}>{goal.reason}</p>}
    {!!goal.steps.length&&<details><summary style={{fontSize:12}}>Progress ({goal.steps.length})</summary><ol>{goal.steps.slice(-10).map((step,index)=><li key={step.at+index} style={{fontSize:12,marginTop:4}}>{step.text}</li>)}</ol></details>}
    {goal.status!=='completed'&&<div style={{display:'flex',gap:8,marginTop:8}}>{goal.status==='running'?<button disabled={busy} onClick={()=>change('/'+goal.id+'/pause','POST')}><Pause size={12}/> Pause</button>:<button disabled={busy||!!goal.pendingQueueId} onClick={()=>change('/'+goal.id+(goal.status==='draft'?'/start':'/resume'),'POST')}><Play size={12}/> {goal.status==='draft'?'Start':'Resume'}</button>}<button disabled={busy||goal.status==='running'} onClick={()=>{setEditing(goal.id);setObjective(goal.objective);setRunLimit(goal.runLimit);}}>Edit</button><button disabled={busy} onClick={()=>change('/'+goal.id+'/complete','POST',{summary:'Marked complete by user.'})}><Check size={12}/> Complete</button></div>}
   </article>)}
  </>}
 </section>;
}
