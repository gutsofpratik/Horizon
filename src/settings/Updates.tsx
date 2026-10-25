import {useEffect,useState} from 'react';
import {api} from '../app/api';
import {openExternal} from '#desktop-ui';
export function Updates({onError}:any){
 const [status,setStatus]=useState<any>(),[busy,setBusy]=useState(false);
 const refresh=()=>api('/updates').then(setStatus);
 useEffect(()=>{let active=true;const load=()=>api('/updates').then(value=>{if(active)setStatus(value);}).catch((error:Error)=>{if(active)onError(error.message);});void load();const timer=setInterval(load,10000);return()=>{active=false;clearInterval(timer);};},[]);
 const act=async(fn:()=>Promise<any>)=>{setBusy(true);try{await fn();await refresh();}catch(error){onError((error as Error).message);}finally{setBusy(false);}};
 const preferences=(patch:any)=>act(()=>api('/updates/preferences',{method:'PATCH',body:JSON.stringify(patch)}));
 return <section className="section-gap"><div className="settings-page-heading"><div><h3>Updates</h3><p className="form-note">Horizon {status?.currentVersion??''}</p></div><button className="secondary-button" disabled={busy||status?.checking} onClick={()=>void act(()=>api('/updates/check',{method:'POST'}))}>{busy||status?.checking?'Checking…':'Check for updates'}</button></div>
 <label className="checkbox-label"><input type="checkbox" checked={status?.preferences?.automaticCheck!==false} disabled={!status||busy} onChange={event=>void preferences({automaticCheck:event.target.checked})}/>Automatically check GitHub for updates</label>
 <label className="checkbox-label"><input type="checkbox" checked={!!status?.preferences?.automaticDownload} disabled={!status?.configured||busy} onChange={event=>void preferences({automaticDownload:event.target.checked})}/>Download verified updates automatically</label>
 <label className="checkbox-label"><input type="checkbox" checked={!!status?.preferences?.automaticInstall} disabled={!status?.automaticInstall||busy} onChange={event=>void preferences({automaticInstall:event.target.checked})}/>Install downloaded updates when I quit Horizon</label>
 {status?.release&&<p className="form-note">{status.release.newer?'Horizon '+status.release.version+' is available.':'You have the latest published version.'} <button className="secondary-button compact" onClick={()=>void openExternal(status.release.url).catch((error:Error)=>onError(error.message))}>View release</button></p>}
 {status?.checkedAt&&<p className="form-note">Last checked {new Date(status.checkedAt).toLocaleString()}</p>}
 {status?.error&&<p role="alert" className="danger">{status.error}</p>}
 {status?.available&&!status?.downloading&&!status?.staged?.some((item:any)=>item.version===status.available.version)&&status.available.assets.map((asset:any,index:number)=>asset.platform===status.platform&&asset.arch===status.arch&&asset.kind==='installer'&&<button key={index} className="secondary-button" disabled={busy} onClick={()=>void act(()=>api('/updates/stage',{method:'POST',body:JSON.stringify({asset:index})}))}>Download update</button>)}
 {status?.downloading&&<p role="status" className="form-note">Downloading and verifying the update…</p>}
 {status?.release?.newer&&status?.staged?.some((item:any)=>item.version===status.release.version)&&<p role="status" className="form-note">Horizon {status.release.version} is ready{status.preferences.automaticInstall?' to install when you quit.':'. Enable installation on quit to apply it.'}</p>}
 {!status?.configured&&<p className="form-note">Automatic downloads and installation need signed release metadata. This build can check GitHub; install published packages from the release page.</p>}
 {status?.configured&&<p className="form-note">Verified Windows updates install after you fully quit the installed desktop app. Closing to the tray keeps your work running. Profiles, chats and model files stay in place.</p>}
 </section>;
}
