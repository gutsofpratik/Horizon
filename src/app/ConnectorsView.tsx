import {useState,useEffect} from 'react';
import {Plug,Plus,Trash2,ExternalLink,Pencil,Loader2} from 'lucide-react';
import {openExternal} from '#desktop-ui';
import {api} from './api';
export async function openConnectorAuthorization(url:string){
 const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol))throw new Error('Invalid authorization URL');
 await openExternal(url);
}
const labels:Record<string,string>={disconnected:'Not connected',connecting:'Connecting…',authorization_required:'Authorization required',connected:'Connected',error:'Connection failed'};
export function ConnectorsView({onError}:any){
 const [items,setItems]=useState<any[]>([]),[editing,setEditing]=useState<any>(null),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const refresh=()=>api('/connectors').then(setItems);
 const fail=(error:any)=>{setError(error.message);onError?.(error.message);};
 useEffect(()=>{let active=true;const update=()=>api('/connectors').then(data=>{if(active)setItems(data);}).catch(error=>{if(active)setError(error.message);});void update();const timer=setInterval(update,2000);return()=>{active=false;clearInterval(timer);};},[]);
 const action=async(id:string,operation:string)=>{setBusy(id);setError('');try{await api(`/connectors/${encodeURIComponent(id)}/${operation}`,{method:'POST'});await refresh();}catch(error){fail(error);}finally{setBusy('');}};
 return <div className="library-page"><div className="page-heading"><div><h1>Connectors</h1><p>Connect your tools and services to OpenClaude.</p></div><button className="primary-button" onClick={()=>setEditing({name:'',url:'',authMode:'oauth'})}><Plus size={15}/>Add connector</button></div>
 <p className="form-note">Authorize a service in your browser. Once connected, its tools are available to the model in chat.</p>
 {error&&<p role="alert" className="connector-error">{error}</p>}
 {items.map(item=><div className="connector-card" key={item.id}><div className="provider-row"><Plug size={20}/><div><strong>{item.name}</strong><small>{item.url}</small></div><span role="status" className="connector-status" data-status={item.status}>{labels[item.status]??'Not connected'}{item.status==='connected'&&` · ${item.toolCount} tools`}</span></div>
 {item.error&&<p role="alert" className="connector-error">{item.error}</p>}
 <div className="button-group">
 {item.status==='authorization_required'&&item.authorizationUrl?<button className="primary-button" onClick={()=>openConnectorAuthorization(item.authorizationUrl).catch(fail)}><ExternalLink size={15}/>Authorize in browser</button>:item.status==='connected'?<button className="secondary-button" disabled={busy===item.id} onClick={()=>action(item.id,'disconnect')}>Disconnect</button>:<button className="primary-button" disabled={busy===item.id||item.status==='connecting'} onClick={()=>action(item.id,'connect')}>{busy===item.id||item.status==='connecting'?<><Loader2 size={14} className="spin"/>Connecting…</>:'Connect'}</button>}
 {item.status==='authorization_required'&&<button className="secondary-button" disabled={busy===item.id} onClick={()=>action(item.id,'connect')}>Restart authorization</button>}
 <button className="secondary-button" disabled={busy===item.id||item.status==='connecting'} aria-label={'Edit connector '+item.name} onClick={()=>{setError('');setEditing({...item,apiKey:'',clientSecret:''});}}><Pencil size={14}/>Edit</button>
 <button className="icon-button" disabled={busy===item.id||item.status==='connecting'} aria-label={'Remove connector '+item.name} onClick={async()=>{try{await api('/connectors/'+encodeURIComponent(item.id),{method:'DELETE'});await refresh();}catch(error){fail(error);}}}><Trash2 size={16}/></button></div>
 {item.status==='authorization_required'&&<p className="form-note">Complete sign-in and consent in the browser. This page updates automatically when authorization finishes.</p>}</div>)}
 {!items.length&&<div className="library-empty"><Plug size={40}/><h2>Your connected tools</h2><p>Add an MCP server to connect its tools.</p></div>}
 {editing&&<div className="modal-backdrop"><form className="dialog" onSubmit={async event=>{event.preventDefault();setBusy('save');setError('');try{const body={...editing};if(!body.apiKey)delete body.apiKey;if(!body.clientSecret)delete body.clientSecret;await api('/connectors',{method:'POST',body:JSON.stringify(body)});setEditing(null);await refresh();}catch(error){fail(error);}finally{setBusy('');}}}>
 <div className="dialog-heading"><h2>{editing.id?'Edit':'Add'} connector</h2><button type="button" aria-label="Close connector editor" onClick={()=>setEditing(null)}>×</button></div>
 <label>Name<input value={editing.name} onChange={event=>setEditing({...editing,name:event.target.value})} required/></label>
 <label>MCP server URL<input value={editing.url} onChange={event=>setEditing({...editing,url:event.target.value})} placeholder="https://example.com/mcp" required/></label>
 <label>Authentication<select value={editing.authMode} onChange={event=>setEditing({...editing,authMode:event.target.value})}><option value="oauth">Browser authorization (OAuth)</option><option value="bearer">API key / bearer token</option><option value="none">No authentication</option></select></label>
 {editing.authMode==='bearer'&&<label>API key<input type="password" autoComplete="off" value={editing.apiKey??''} onChange={event=>setEditing({...editing,apiKey:event.target.value})} placeholder={editing.hasApiKey?'Saved — leave blank to keep':'Enter access token'}/></label>}
 {editing.authMode==='oauth'&&<details><summary>Advanced OAuth settings</summary><p className="form-note">Most servers register automatically. If the service requires your own OAuth app, enter its client ID and register this redirect URL:</p><code className="connector-callback">{window.location.origin}/api/connectors/oauth/callback</code><label>Client ID<input value={editing.clientId??''} onChange={event=>setEditing({...editing,clientId:event.target.value})}/></label><label>Client secret (if required)<input type="password" autoComplete="off" value={editing.clientSecret??''} onChange={event=>setEditing({...editing,clientSecret:event.target.value})}/></label></details>}
 {error&&<p role="alert" className="connector-error">{error}</p>}
 <div className="dialog-actions"><button type="button" className="secondary-button" onClick={()=>setEditing(null)}>Cancel</button><button className="primary-button" disabled={busy==='save'}>{busy==='save'?'Saving…':'Save connector'}</button></div></form></div>}
 </div>;
}
