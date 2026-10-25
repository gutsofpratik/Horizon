import {useEffect,useState} from 'react';
import {api} from '../app/api';
import {Copy,Eye,EyeOff,KeyRound,Power,RefreshCw,MoreHorizontal,Trash2,ShieldOff} from 'lucide-react';
export function InferenceSettings({apiOnly=false,onError}:any){
 const [modelNames,setModelNames]=useState<Record<string,string>>({});
 const [state,setState]=useState<any>(null),[visible,setVisible]=useState<Record<string,string>>({}),[name,setName]=useState(''),[busy,setBusy]=useState(false),[menu,setMenu]=useState<string|null>(null),[restoring,setRestoring]=useState<string|null>(null),[original,setOriginal]=useState('');
 const refresh=()=>api('/inference-api').then(value=>{setState(value);return value;});
 useEffect(()=>{void refresh().catch(error=>onError(error.message));const timer=setInterval(()=>void refresh().catch(()=>{}),3000);return()=>clearInterval(timer);},[]);
 const action=async(path:string,body?:any,method='POST')=>{setBusy(true);try{const result=await api(path,{method,...(body?{body:JSON.stringify(body)}:{})});await refresh();return result;}catch(error){onError((error as Error).message);}finally{setBusy(false);}};
 const reveal=async(id:string)=>{if(visible[id]){setVisible(previous=>{const next={...previous};delete next[id];return next;});return;}const result=await action('/inference-api/keys/'+encodeURIComponent(id)+'/reveal');if(result?.key)setVisible(previous=>({...previous,[id]:result.key}));};
 const copy=(text:string)=>void navigator.clipboard.writeText(text).catch(error=>onError(error.message));
 useEffect(()=>{if(!state?.loaded?.modelId)return;void api('/model-library').then(result=>setModelNames(Object.fromEntries((result.models??[]).map((model:any)=>[model.id,model.name])))).catch(()=>{});},[state?.loaded?.modelId]);
 const loaded=state?.loaded;
 return <section>
  <div className="settings-section-heading"><h3>{apiOnly?'API endpoints':'Inference sessions'}</h3><button className="icon-button" aria-label="Refresh inference status" onClick={()=>void refresh().catch(error=>onError(error.message))}><RefreshCw size={16}/></button></div>
  {!apiOnly?<><p className="form-note">Models currently held in memory. Eject releases the model; sending a new chat message can load it again.</p>{loaded?<div className="model-configuration"><h4>{modelNames[loaded.modelId]??loaded.name??'Local model'}</h4><dl className="settings-facts"><dt>Device</dt><dd>{loaded.device==='cuda'?'GPU · CUDA':loaded.device??'Runtime managed'}</dd><dt>Total context</dt><dd>{loaded.configuration?.contextTokens?.toLocaleString()??'Runtime default'}</dd><dt>State</dt><dd><span className="settings-status-pill">{state.status==='loaded'?'Ready':state.status}</span></dd><dt>Capabilities</dt><dd className="settings-chip-list">{loaded.capabilities?.length?loaded.capabilities.map((value:string)=><span className="settings-status-pill" key={value}>{value.replaceAll('_',' ')}</span>):'Not reported'}</dd></dl><button className="secondary-button" disabled={busy} onClick={()=>void action('/model-library/unload')}><Power size={14}/>Eject model</button></div>:<p className="form-note">No local model is loaded. Choose a model in chat and send a message to load it.</p>}</>:<>
   <p className="form-note">Connect another app to your loaded model using this URL and an API key.</p>
   <div className="model-configuration">
    <div className="settings-section-heading"><strong>{state?.running?'Running':state?.enabled?'Unable to start':'Stopped'}</strong><button className="secondary-button" disabled={busy||!state} onClick={()=>void action('/inference-api/'+(state.running?'stop':'start'))}>{state?.running?'Stop endpoint':'Start endpoint'}</button></div>
    {state?.error&&<p role="alert">{state.error}</p>}
    <label>Base URL<div className="button-group"><input readOnly value={state?.baseUrl??'http://127.0.0.1:1234/v1'}/><button className="icon-button" aria-label="Copy base URL" onClick={()=>copy(state?.baseUrl??'http://127.0.0.1:1234/v1')}><Copy size={14}/></button></div></label>
    <p className="form-note">Stays enabled across restarts. Available while Horizon is running.</p>
   </div>
   <h4>API keys</h4><p className="form-note">Give each app its own key. Reveal or copy it anytime; revoke a key to disconnect that app.</p>
   <div className="button-group"><input aria-label="API key name" placeholder="App name (optional)" maxLength={80} value={name} onChange={event=>setName(event.target.value)}/><button className="secondary-button" disabled={busy} onClick={async()=>{const result=await action('/inference-api/key',{name:name||'Local application'});if(result)setName('');}}><KeyRound size={14}/>Create key</button></div>
   {!state?.keys?.length&&<p className="form-note">No API keys yet. Starting the endpoint creates the first one.</p>}
   <div className="api-key-list">{state?.keys?.map((item:any)=><div className="api-key-row" key={item.id}>
    <div className="api-key-info"><strong>{item.name}</strong><small>{item.revokedAt?'Revoked':item.createdAt?'Created '+new Date(item.createdAt).toLocaleDateString():'Existing key'}</small>
     {!item.revokedAt&&<code>{visible[item.id]??'hzn_••••••••••••••••'}</code>}
    </div>
    <div className="api-key-actions">
     <button className="icon-button" aria-label={'Actions for '+item.name} aria-haspopup="menu" aria-expanded={menu===item.id} disabled={busy} onClick={()=>setMenu(menu===item.id?null:item.id)}><MoreHorizontal size={17}/></button>
     {menu===item.id&&<><button className="api-key-dismiss" aria-label="Close key actions" onClick={()=>setMenu(null)}/><div className="api-key-menu" role="menu" onKeyDown={event=>{if(event.key==='Escape')setMenu(null);}}>
      {!item.revokedAt&&item.canReveal&&<><button role="menuitem" onClick={()=>{setMenu(null);void reveal(item.id);}}>{visible[item.id]?<EyeOff size={14}/>:<Eye size={14}/>} {visible[item.id]?'Hide key':'Reveal key'}</button><button role="menuitem" onClick={async()=>{setMenu(null);const result=await action('/inference-api/keys/'+encodeURIComponent(item.id)+'/reveal');if(result?.key)copy(result.key);}}><Copy size={14}/>Copy key</button></>}
      {!item.revokedAt&&!item.canReveal&&<button role="menuitem" onClick={()=>{setMenu(null);setOriginal('');setRestoring(item.id);}}><KeyRound size={14}/>Save existing key</button>}
      {!item.revokedAt&&<button role="menuitem" onClick={async()=>{setMenu(null);const result=await action('/inference-api/keys/'+encodeURIComponent(item.id),undefined,'DELETE');if(result)setVisible(previous=>{const next={...previous};delete next[item.id];return next;});}}><ShieldOff size={14}/>Revoke key</button>}
      <button role="menuitem" onClick={async()=>{setMenu(null);const result=await action('/inference-api/keys/'+encodeURIComponent(item.id)+'/record',undefined,'DELETE');if(result)setVisible(previous=>{const next={...previous};delete next[item.id];return next;});}}><Trash2 size={14}/>Delete key</button>
     </div></>}
    </div>
    {restoring===item.id&&<form className="api-key-restore" onSubmit={async event=>{event.preventDefault();const result=await action('/inference-api/keys/'+encodeURIComponent(item.id)+'/restore',{key:original});if(result){setOriginal('');setRestoring(null);}}}>
     <p className="form-note">Paste this key from your connected app to enable Reveal and Copy. Its value and existing connections stay the same.</p><input type="password" autoComplete="off" aria-label="Original API key" placeholder="Paste existing API key" value={original} onChange={event=>setOriginal(event.target.value)}/><div className="button-group"><button type="button" className="secondary-button" onClick={()=>{setOriginal('');setRestoring(null);}}>Cancel</button><button className="secondary-button" disabled={busy||!original.trim()}>Save key</button></div>
    </form>}
   </div>)}</div>
  </>}
 </section>;
}
