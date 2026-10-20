import {useEffect,useState} from 'react';
import {Bell,X} from 'lucide-react';
import {api} from './api';
export function Notifications(){
 const [items,setItems]=useState<any[]>([]),[open,setOpen]=useState(false);
 useEffect(()=>{let disposed=false;const read=()=>api('/notifications').then(result=>{if(!disposed)setItems(result.notifications??[]);}).catch(()=>{});void read();const timer=setInterval(read,5000);return()=>{disposed=true;clearInterval(timer);};},[]);
 if(!items.length)return null;
 return <aside style={{position:'fixed',right:20,bottom:20,zIndex:1100,maxWidth:350}} aria-label="Notifications"><button className="button" onClick={()=>setOpen(!open)} aria-expanded={open}><Bell size={16}/> {items.length} notification{items.length===1?'':'s'}</button>{open&&<div className="dialog" style={{padding:16,maxHeight:'50vh',overflowY:'auto'}}>{items.map(item=><article key={item.id} style={{padding:10}}><strong>{item.title}</strong><button className="icon-button" aria-label={'Dismiss '+item.title} onClick={async()=>{await api('/notifications/'+item.id+'/read',{method:'POST'});setItems(previous=>previous.filter(value=>value.id!==item.id));}}><X size={14}/></button><p>{item.message}</p><a href={'/chat/'+encodeURIComponent(item.conversationId)}>Open chat</a></article>)}</div>}</aside>;
}
