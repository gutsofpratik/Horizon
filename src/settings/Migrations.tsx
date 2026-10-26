import {useEffect,useState} from 'react';
import {api} from '../app/api';
export function Migrations({onError}:any){
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 return <section className="section-gap"><h3>Backups and recovery</h3><button className="secondary-button" disabled={busy} onClick={async()=>{setBusy(true);setNotice('');try{await api('/migrations/prepare',{method:'POST'});setNotice('Database backup prepared.');}catch(error){onError((error as Error).message);}finally{setBusy(false);}}}>{busy?'Preparing backup…':'Prepare a database backup'}</button>{notice&&<p className="form-note" role="status">{notice}</p>}</section>;
}
