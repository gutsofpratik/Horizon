import {HorizonMark} from '../components/HorizonMark';
import {useEffect,useState,type ReactNode} from 'react';
import {Loader2,Check,TriangleAlert} from 'lucide-react';
import {api} from './api';
import {isDesktopEdition} from '../platform/edition';
export function HorizonLoading({title='Opening your workspace',children}:{title?:string;children?:ReactNode}){
 return <main className="horizon-startup" aria-label="Preparing Horizon"><div className="horizon-startup-content"><div className="startup-brand"><HorizonMark size={48}/><h1>Horizon</h1></div><div className="startup-heading" role="status"><Loader2 size={18} className="spin"/><span>{title}</span></div>{children}</div></main>;
}
export function RuntimeReady({children}:{children:ReactNode}){
 const [state,setState]=useState<any>(null),[error,setError]=useState('');
 useEffect(()=>{if(!isDesktopEdition)return;let alive=true,inFlight=false;const load=async()=>{if(inFlight)return;inFlight=true;try{const value=await api('/runtime/startup');if(alive){setState(value);setError('');}}catch(error){if(alive)setError((error as Error).message);}finally{inFlight=false;}};void load();const timer=setInterval(load,1500);return()=>{alive=false;clearInterval(timer);};},[]);
 if(!isDesktopEdition||state?.ready)return <>{children}</>;
 const failed=error||state?.office?.status==='failed'||state?.pdf?.status==='failed';
 const stage=[state?.office,state?.pdf].find(service=>service&&!service.ready)?.status;
 const title=failed?'Workspace setup needs attention':stage==='downloading'?'Downloading dependencies':stage==='installing'?'Installing workspace dependencies':'Setting up your workspace';
 return <HorizonLoading title={title}><p className="startup-description">Getting everything ready for your first conversation.</p><div className="startup-services">{[['Office documents',state?.office],['PDF tools',state?.pdf]].map(([label,service]:any)=><div key={label}><span>{service?.ready?<Check size={15}/>:service?.status==='failed'?<TriangleAlert size={15}/>:<Loader2 size={15} className="spin"/>}{label}</span><small>{service?.ready?'Ready':service?.status==='downloading'?'Downloading…':service?.status==='installing'?'Installing dependencies…':service?.status==='failed'?'Setup interrupted':'Preparing…'}</small>{service?.downloadProgress&&<progress aria-label={'Downloading '+label} value={service.downloadProgress.receivedBytes} max={service.downloadProgress.totalBytes||undefined}/ >}{service?.error&&<p role="alert">{service.error}</p>}</div>)}</div>{error&&<p role="alert" className="startup-error">{error}</p>}{failed&&<button className="primary-button" onClick={()=>{setError('');void api('/runtime/startup/repair',{method:'POST'}).catch(error=>setError(error.message));}}>Retry setup</button>}</HorizonLoading>;
}
