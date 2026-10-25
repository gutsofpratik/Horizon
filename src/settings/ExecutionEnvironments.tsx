import {useEffect,useState} from 'react';
import {Plus,Server,Link2} from 'lucide-react';
import {api} from '../app/api';
import {SettingsDialog} from './SettingsDialog';
export function ExecutionEnvironments({settings,update,onError}:{settings:any;update:(patch:any)=>void;onError:(message:string)=>void}){
 const [items,setItems]=useState<any[]>([]),[name,setName]=useState(''),[url,setUrl]=useState(''),[token,setToken]=useState(''),[status,setStatus]=useState(''),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false);
 const load=()=>api('/environments').then(result=>setItems(result.environments));
 useEffect(()=>{void load().catch(error=>onError(error.message));},[]);
 const act=async(task:()=>Promise<void>)=>{setBusy(true);try{await task();}catch(error){onError((error as Error).message);}finally{setBusy(false);}};
 return <section className="settings-page">
  <div className="settings-page-heading"><div><h3>Execution environments</h3><p className="form-note">Choose where isolated browser, terminal and file operations run.</p></div><button className="secondary-button compact" onClick={()=>setEditing(true)}><Plus size={14}/>Add environment</button></div>
  <label>Active environment<select value={settings.executionEnvironmentId??''} onChange={event=>update({executionEnvironmentId:event.target.value||null})}><option value="">Local execution</option>{items.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
  <p className="form-note">Local execution uses your configured local worker. Remote environments need an existing Horizon worker with its own dependencies and storage.</p>
  {!items.length&&<div className="settings-empty"><Server size={23}/><strong>No remote environments</strong><p>Add a worker when you want to run isolated tasks on another machine.</p></div>}
  {items.map(item=><div className="settings-info-row" key={item.id}><Server size={17}/><div><strong>{item.name}</strong><small>{settings.executionEnvironmentId===item.id?'Selected environment':'Remote worker'}</small><details><summary>Connection details</summary><p className="form-note">{item.url}</p></details></div><button className="secondary-button compact" disabled={busy} onClick={()=>void act(async()=>{await api('/environments/'+item.id+'/connect',{method:'POST'});setStatus(item.name+' connected');})}><Link2 size={13}/>Connect</button><button className="secondary-button compact" disabled={busy} onClick={()=>void act(async()=>{await api('/environments/'+item.id,{method:'DELETE'});if(settings.executionEnvironmentId===item.id)update({executionEnvironmentId:null});await load();})}>Remove</button></div>)}
  {status&&<p role="status" className="form-note">{status}</p>}
  {editing&&<SettingsDialog title="Add environment" onClose={()=>{setEditing(false);setToken('');}}><form className="settings-edit-form" onSubmit={event=>{event.preventDefault();void act(async()=>{await api('/environments',{method:'POST',body:JSON.stringify({name:name.trim(),url:url.trim(),token})});setToken('');setName('');setUrl('');setEditing(false);await load();});}}>
   <p className="form-note">Connect an existing Horizon worker over HTTPS. This does not deploy or purchase hosting.</p>
   <label>Name<input required value={name} onChange={event=>setName(event.target.value)}/></label><label>Worker URL<input type="url" required value={url} onChange={event=>setUrl(event.target.value)} placeholder="https://your-private-worker.example"/></label><label>Worker token<input type="password" required autoComplete="off" value={token} onChange={event=>setToken(event.target.value)}/></label>
   <div className="dialog-actions"><button type="button" className="secondary-button" onClick={()=>{setEditing(false);setToken('');}}>Cancel</button><button className="primary-button" disabled={busy||!name.trim()||!url.trim()||!token}>{busy?'Saving…':'Save environment'}</button></div>
  </form></SettingsDialog>}
 </section>;
}
