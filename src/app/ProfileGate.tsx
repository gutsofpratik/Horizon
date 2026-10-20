import {useEffect,useState,type FormEvent,type ReactNode} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {api} from './api';
import {isDesktopEdition} from '../platform/edition';
import {ArrowRight,Flower,Globe,Leaf,LockKeyhole,LogOut,Moon,Orbit,Plus,ShieldCheck,Sparkles,Sun,Zap} from 'lucide-react';

const avatars:any={spark:Sparkles,planet:Globe,leaf:Leaf,bolt:Zap,flower:Flower,moon:Moon,sun:Sun,orbit:Orbit};
function ProfileFields({onSubmit,busy,error,submitText='Create profile'}:any){
 const [name,setName]=useState(''),[loginId,setLoginId]=useState(''),[password,setPassword]=useState(''),[avatar,setAvatar]=useState('spark');
 return <form className="profile-form" onSubmit={(event:FormEvent)=>{event.preventDefault();void onSubmit({name,loginId,password,avatar});}}>
  <div className="profile-avatar-picker" role="group" aria-label="Choose profile icon">{Object.entries(avatars).map(([id,Icon]:any)=><button type="button" key={id} className={avatar===id?'selected':''} aria-label={'Choose '+id+' icon'} aria-pressed={avatar===id} onClick={()=>setAvatar(id)}><Icon size={18}/></button>)}</div>
  <label>Your name<input autoFocus maxLength={80} autoComplete="name" value={name} onChange={event=>setName(event.target.value)} placeholder="What should Horizon call you?" required/></label>
  <label>Login ID<input minLength={3} maxLength={32} autoComplete="username" value={loginId} onChange={event=>setLoginId(event.target.value)} placeholder="letters, numbers, . _ -" required/></label>
  <label>Password<input type="password" minLength={8} maxLength={1024} autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)} placeholder="At least 8 characters" required/></label>
  {error&&<p className="profile-error" role="alert">{error}</p>}
  <button className="primary-button profile-submit" disabled={busy}>{busy?'Saving securely…':submitText}<ArrowRight size={16}/></button>
 </form>;
}
async function restartIntoProfile(){
 const native=(window as any).__TAURI_INTERNALS__;
 if(!native)throw new Error('Profile switching requires the Horizon desktop app.');
 await invoke('profile_restart');
}

export function ProfileGate({children}:{children:ReactNode}){
 const [state,setState]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loginId,setLoginId]=useState(''),[password,setPassword]=useState('');
 const refresh=()=>api('/profiles/status').then((value:any)=>{setState(value);setLoginId(value.activeProfile?.loginId??value.profiles?.[0]?.loginId??'');}).catch((fault:Error)=>setError(fault.message));
 useEffect(()=>{if(isDesktopEdition)void refresh();},[]);
 if(!isDesktopEdition)return <>{children}</>;
 if(!state)return <div className="profile-loading" role="status">{error||'Opening Horizon profiles…'}</div>;
 if(state.authenticated)return <>{children}</>;
 const create=async(input:any)=>{setBusy(true);setError('');try{const result=await api('/profiles/create',{method:'POST',body:JSON.stringify(input)});if(result.authenticated){await refresh();}else setState((previous:any)=>({...previous,initialized:true,profiles:[...previous.profiles,result.profile]}));}catch(fault){setError((fault as Error).message);}finally{setBusy(false);}};
 const unlock=async(event:FormEvent)=>{event.preventDefault();setBusy(true);setError('');try{const result:any=await api('/profiles/login',{method:'POST',body:JSON.stringify({loginId,password})});if(result.selectRequired){const selected:any=await api('/profiles/select',{method:'POST',body:JSON.stringify({loginId,password})});setPassword('');if(selected.restartRequired)await restartIntoProfile();await refresh();return;}if(!result.authenticated)throw new Error('That login ID or password is incorrect');setPassword('');await refresh();}catch(fault){setError((fault as Error).message);}finally{setBusy(false);}};
 return <div className="profile-gate"><section className="profile-card" role="dialog" aria-modal="true" aria-labelledby="profile-title"><div className="profile-mark"><Sparkles size={19}/></div><div className="profile-kicker">HORIZON · PRIVATE WORKSPACE</div><h1 id="profile-title">{state.initialized?'Welcome back.':'Create your profile.'}</h1><p>{state.initialized?'Choose your profile and sign in to open its conversations, settings, and files.':'Your name, login ID, and password keep this local profile separate on this device.'}</p>
  {!state.initialized?<ProfileFields onSubmit={create} busy={busy} error={error}/>:<form className="profile-form" onSubmit={unlock}><label>Profile<select value={loginId} onChange={event=>setLoginId(event.target.value)}>{state.profiles.map((profile:any)=><option key={profile.id} value={profile.loginId}>{profile.name} · @{profile.loginId}</option>)}</select></label><label>Password<input autoFocus type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required/></label>{error&&<p className="profile-error" role="alert">{error}</p>}<button className="primary-button profile-submit" disabled={busy}>{busy?'Unlocking…':'Unlock profile'}<LockKeyhole size={16}/></button><p className="profile-secure-note"><ShieldCheck size={14}/>Passwords are stored as salted local hashes.</p></form>}
 </section></div>;
}

export function ProfileManager({onClose,onError}:any){
 const [state,setState]=useState<any>(null),[createOpen,setCreateOpen]=useState(false),[busy,setBusy]=useState(false),[passwords,setPasswords]=useState<Record<string,string>>({}),[error,setError]=useState('');
 const refresh=()=>api('/profiles/status').then(setState).catch((fault:Error)=>setError(fault.message));
 useEffect(()=>{void refresh();},[]);
 const create=async(input:any)=>{setBusy(true);setError('');try{await api('/profiles/create',{method:'POST',body:JSON.stringify(input)});setCreateOpen(false);await refresh();}catch(fault){setError((fault as Error).message);}finally{setBusy(false);}};
 const select=async(profile:any)=>{setBusy(true);setError('');try{const result:any=await api('/profiles/select',{method:'POST',body:JSON.stringify({loginId:profile.loginId,password:passwords[profile.id]??''})});if(!result.selected)throw new Error('That password is incorrect');if(result.restartRequired)await restartIntoProfile();}catch(fault){setError((fault as Error).message);setBusy(false);}};
 const logout=async()=>{try{await api('/profiles/session',{method:'DELETE'});location.reload();}catch(fault){setError((fault as Error).message);}};
 return <div className="modal-backdrop profile-manager-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section className="dialog profile-manager" role="dialog" aria-modal="true" aria-labelledby="profiles-heading"><header><div><small>HORIZON</small><h2 id="profiles-heading">Profiles</h2></div><button className="icon-button" aria-label="Close profiles" onClick={onClose}>×</button></header>{error&&<p className="profile-error" role="alert">{error}</p>}{state?.profiles?.map((profile:any)=>{const Icon=avatars[profile.avatar]??Sparkles;const active=profile.id===state.activeProfile?.id;return <div className="profile-row" key={profile.id}><span className="profile-row-avatar"><Icon size={17}/></span><div><strong>{profile.name}</strong><small>@{profile.loginId}{active?' · Current profile':''}</small></div>{!active&&<div className="profile-switch"><input aria-label={'Password for '+profile.name} type="password" autoComplete="current-password" value={passwords[profile.id]??''} onChange={event=>setPasswords(previous=>({...previous,[profile.id]:event.target.value}))} placeholder="Password"/><button disabled={busy||!(passwords[profile.id]?.length)} onClick={()=>void select(profile)}>Switch</button></div>}</div>;})}{createOpen?<ProfileFields onSubmit={create} busy={busy} error={error}/>:<button className="profile-add" onClick={()=>setCreateOpen(true)}><Plus size={16}/>Add profile</button>}<button className="profile-logout" onClick={()=>void logout()}><LogOut size={15}/>Lock this profile</button></section></div>;
}
