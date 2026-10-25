import {useEffect,useState} from 'react';
import {Copy,Link2,Plus,Settings2,Smartphone,ShieldCheck} from 'lucide-react';
import {api} from '../app/api';
import {isDesktopEdition} from '../platform/edition';
import {SettingsDialog} from './SettingsDialog';

export function RemoteControl({tools,onError}:{tools:any[];onError:(message:string)=>void}){
 const [origin,setOrigin]=useState(''),[originSaved,setOriginSaved]=useState(''),[grants,setGrants]=useState<any[]>([]),[chats,setChats]=useState<any[]>([]);
 const [conversation,setConversation]=useState(''),[name,setName]=useState('My device'),[selected,setSelected]=useState<string[]>([]),[approvals,setApprovals]=useState(false);
 const [pairing,setPairing]=useState<any>(null),[dialog,setDialog]=useState<'connection'|'pair'|null>(null),[busy,setBusy]=useState(false),[query,setQuery]=useState('');
 const load=async()=>{const result=await api('/remote/grants');setGrants(result.grants);setOrigin(result.origin??'');setOriginSaved(result.origin??'');};
 useEffect(()=>{void load().catch(error=>onError(error.message));void api('/entities/conversations?summary=true').then(setChats).catch(error=>onError(error.message));},[]);
 useEffect(()=>{if(!pairing)return;const timer=setInterval(()=>{void api('/remote/grants').then(result=>setGrants(result.grants)).catch(()=>{});},5000);return()=>clearInterval(timer);},[pairing]);
 const act=async(task:()=>Promise<void>)=>{if(busy)return;setBusy(true);try{await task();}catch(error){onError((error as Error).message);}finally{setBusy(false);}};
 const copy=(value:string)=>void navigator.clipboard.writeText(value).catch(error=>onError(error.message));
 return <section className="settings-page">
  <div className="settings-page-heading"><div><h3>Remote control</h3><p className="form-note">Continue a conversation from another device with the access you choose.</p></div><button className="secondary-button compact" onClick={()=>{setOrigin(originSaved);setDialog('connection');}}><Settings2 size={14}/>Connection</button></div>
  <div className="settings-info-row"><Link2 size={17}/><div><strong>Private connection</strong><small>{originSaved?'Configured · available while Horizon is running':'Set up a private HTTPS connection to pair a device.'}</small></div><span className="settings-status-pill">{originSaved?'Configured':'Setup needed'}</span></div>
  <div className="settings-section-heading"><h4>Paired devices</h4><button className="secondary-button compact" onClick={()=>{setPairing(null);setSelected([]);setApprovals(false);setDialog(originSaved?'pair':'connection');}}><Plus size={14}/>Pair device</button></div>
  {!grants.length&&<div className="settings-empty"><Smartphone size={23}/><strong>No devices paired</strong><p>Pair a phone or another computer to access a saved conversation.</p></div>}
  <div className="settings-item-list">{grants.map(grant=><div className="settings-info-row" key={grant.id}><Smartphone size={17}/><div><strong>{grant.name}</strong><small>{grant.revoked?'Access revoked':'Expires '+new Date(grant.expiresAt).toLocaleString()}</small><small>{grant.tools?.length??0} tools allowed{grant.allowApprovals?' · Can answer approvals':''}</small></div>{!grant.revoked&&<button className="secondary-button compact" disabled={busy} onClick={()=>void act(async()=>{await api('/remote/grants/'+encodeURIComponent(grant.id),{method:'DELETE'});await load();})}>Revoke</button>}</div>)}</div>
  {dialog==='connection'&&<SettingsDialog title="Private connection" onClose={()=>setDialog(null)}><form className="settings-edit-form" onSubmit={event=>{event.preventDefault();void act(async()=>{const result=await api('/remote/configuration',{method:'POST',body:JSON.stringify({origin:origin.trim()})});setOriginSaved(result.origin);setOrigin(result.origin);setPairing(null);setDialog(null);});}}>
   <p className="form-note">Use an existing private HTTPS tunnel forwarding to Horizon on port 3001. Horizon does not provision a tunnel or public hosting.</p>
   <label>Connection address<input type="url" required placeholder="https://your-private-host.example" value={origin} onChange={event=>setOrigin(event.target.value)}/></label>
   {originSaved&&<button type="button" className="secondary-button compact" onClick={()=>copy(originSaved+'/remote')}><Copy size={14}/>Copy remote link</button>}
   <div className="dialog-actions"><button type="button" className="secondary-button" onClick={()=>setDialog(null)}>Cancel</button><button className="primary-button" disabled={busy||!origin.trim()}>{busy?'Saving…':'Save connection'}</button></div>
  </form></SettingsDialog>}
  {dialog==='pair'&&<SettingsDialog title={pairing?'Scan to pair':'Pair a device'} onClose={()=>{setDialog(null);setPairing(null);}}>
   {pairing?<div className="remote-pairing-preview">
    <p className="form-note">Scan this one-time code on your other device. It expires after five minutes.</p>
    {pairing.qrDataUrl?<img src={pairing.qrDataUrl} alt="One-time Horizon device pairing QR code" width={216} height={216}/>:<p role="alert">The connection address could not produce a QR code.</p>}
    <button className="secondary-button" onClick={()=>copy(pairing.pairingUrl)} disabled={!pairing.pairingUrl}><Copy size={14}/>Copy pairing link</button>
    <details><summary>Enter pairing details manually</summary><dl className="settings-facts"><dt>Pairing ID</dt><dd>{pairing.pairingId}</dd><dt>Code</dt><dd>{pairing.code}</dd></dl></details>
    <button className="secondary-button" onClick={()=>{setPairing(null);setDialog(null);}}>Done</button>
   </div>:<form className="settings-edit-form" onSubmit={event=>{event.preventDefault();void act(async()=>{setPairing(await api('/remote/pairings',{method:'POST',body:JSON.stringify({conversationId:conversation,name:name.trim(),tools:selected,allowApprovals:approvals,edition:isDesktopEdition?'desktop':'web'})}));});}}>
    <label>Device name<input required maxLength={100} value={name} onChange={event=>setName(event.target.value)}/></label>
    <label>Conversation<select required value={conversation} onChange={event=>setConversation(event.target.value)}><option value="">Choose a saved conversation</option>{chats.filter(chat=>!chat.incognito).map(chat=><option key={chat.id} value={chat.id}>{chat.title}</option>)}</select></label>
    <details className="settings-disclosure"><summary><ShieldCheck size={14}/>Allowed tools <small>{selected.length} selected</small></summary><input aria-label="Find a remote tool" placeholder="Find a tool" value={query} onChange={event=>setQuery(event.target.value)}/><div className="settings-choice-list">{tools.filter(tool=>tool.available&&tool.name.toLowerCase().includes(query.toLowerCase())).map(tool=><label className="checkbox-label" key={tool.name}><input type="checkbox" checked={selected.includes(tool.name)} onChange={event=>setSelected(event.target.checked?[...selected,tool.name]:selected.filter(name=>name!==tool.name))}/>{tool.name.replaceAll('_',' ')}</label>)}</div><p className="form-note">Only selected tools can run from this device. You can choose up to 30.</p></details>
    <label className="checkbox-label"><input type="checkbox" checked={approvals} onChange={event=>setApprovals(event.target.checked)}/>Allow this device to answer approval requests</label>
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={()=>setDialog(null)}>Cancel</button><button className="primary-button" disabled={busy||!conversation||!name.trim()||selected.length>30}>{busy?'Preparing…':'Create pairing code'}</button></div>
   </form>}
  </SettingsDialog>}
 </section>;
}
