import {useEffect,useState,type ReactNode} from 'react';
import {Check} from 'lucide-react';
import {api} from './api';
import {isDesktopEdition} from '../platform/edition';
export function HorizonLoading({title='Opening your workspace',children,phase='brand'}:{title?:string;children?:ReactNode;phase?:'brand'|'status'|'ready'}){
 return <main className="horizon-startup" aria-label="Preparing Horizon"><div className="horizon-startup-content" key={phase}>{phase==='brand'?<div className="startup-brand"><h1>Horizon</h1></div>:<div className="startup-heading" role="status">{phase==='ready'?<Check size={14}/>:<span className="startup-loader" aria-hidden="true"><i/><i/><i/></span>}<span>{title}</span></div>}{children}</div></main>;
}
export function RuntimeReady({children}:{children:ReactNode}){
 const [state,setState]=useState<any>(null),[error,setError]=useState(''),[phase,setPhase]=useState<'brand'|'status'|'ready'|'done'>('brand');
 useEffect(()=>{if(!isDesktopEdition)return;let alive=true,pending=false;const load=async()=>{if(pending)return;pending=true;try{const value=await api('/runtime/startup');if(alive){setState(value);setError('');}}catch(error){if(alive)setError((error as Error).message);}finally{pending=false;}};void load();const timer=setInterval(load,1500),brand=setTimeout(()=>setPhase('status'),1100);return()=>{alive=false;clearInterval(timer);clearTimeout(brand);};},[]);
 useEffect(()=>{if(phase!=='status'||!state?.ready)return;const ready=setTimeout(()=>setPhase('ready'),250);return()=>clearTimeout(ready);},[phase,state?.ready]);
 useEffect(()=>{if(phase!=='ready')return;const done=setTimeout(()=>setPhase('done'),500);return()=>clearTimeout(done);},[phase]);
 if(!isDesktopEdition||phase==='done')return <>{children}</>;
 const failed=error||state?.office?.status==='failed'||state?.pdf?.status==='failed',installing=[state?.office,state?.pdf].some(service=>['downloading','installing'].includes(service?.status));
 const title=phase==='ready'?'Ready to go':failed?'Setup needs attention':installing?'Installing dependencies':'Setting up your workspace';
 return <HorizonLoading title={title} phase={phase==='brand'?'brand':phase==='ready'?'ready':'status'}>{phase==='status'&&failed&&<><p role="alert" className="startup-error">{error||'Setup was interrupted. Please retry.'}</p><button className="primary-button" onClick={()=>{setError('');void api('/runtime/startup/repair',{method:'POST'}).catch(error=>setError(error.message));}}>Retry setup</button></>}</HorizonLoading>;
}
