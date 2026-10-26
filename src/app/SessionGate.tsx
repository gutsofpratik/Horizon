import {useEffect,useState,type ReactNode} from 'react';
import {api} from './api';
import {HorizonLoading} from './RuntimeReady';
export function SessionGate({children}:{children:ReactNode}){
 const [ready,setReady]=useState(false),[checking,setChecking]=useState(true),[token,setToken]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;api('/session').then(async value=>{if(value.authenticated){try{await api('/profiles/status');}catch{}}if(active)setReady(value.authenticated);}).catch(error=>{if(active)setError(error.message);}).finally(()=>{if(active)setChecking(false);});return()=>{active=false;};},[]);
 if(checking)return <HorizonLoading/>;
 if(ready)return <>{children}</>;
 return <div className="modal-backdrop"><form className="dialog" style={{width:420,padding:28}} onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{await api('/session',{method:'POST',headers:{Authorization:'Bearer '+token.trim()}});setToken('');setReady(true);}catch(error){setError((error as Error).message);}finally{setBusy(false);}}}><h2>Unlock Horizon</h2><p>Enter your host access token. For a web installation, find it in <code>host-access.json</code> in the application data directory. Desktop signs in through its native host.</p><label>Access token<input type="password" autoComplete="off" value={token} onChange={event=>setToken(event.target.value)} required/></label>{error&&<p role="alert">{error}</p>}<button disabled={busy}>{busy?'Connecting…':'Continue'}</button></form></div>;
}
