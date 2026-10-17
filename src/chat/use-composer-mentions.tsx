import {useEffect,useId,useState} from 'react';
import {BookOpen,Wrench} from 'lucide-react';
import {api} from '../app/api';
import {isDesktopEdition} from '../platform/edition';
import {mentionQuery,insertMention} from './mention-query';

export function useComposerMentions({text,setText,field,skills,tools,settings}:any){
 const id=useId(),[caret,setCaret]=useState(0),[focused,setFocused]=useState(false),[dismissed,setDismissed]=useState(''),[selected,setSelected]=useState(0),[catalog,setCatalog]=useState(tools),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const token=focused?mentionQuery(text,caret):null,key=text+':'+caret;
 const open=!!token&&dismissed!==key;
 useEffect(()=>setCatalog(tools),[tools]);
 useEffect(()=>{if(!open||token?.kind!=='tool')return;let live=true;setLoading(true);setError('');api('/tools').then(items=>{if(live)setCatalog(items.filter((item:any)=>isDesktopEdition||!item.name.startsWith('terminal_')&&!item.name.startsWith('computer_')&&item.name!=='skill_run_script'));}).catch(error=>{if(live)setError(error.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[open,token?.kind]);
 const entries=(token?.kind==='tool'?catalog:skills.filter((item:any)=>item.installed&&item.available&&item.enabled!==false)).map((item:any)=>({...item,blocked:token?.kind==='tool'?(settings.toolsEnabled===false?'Tools are turned off':settings.enabledToolNames&&!settings.enabledToolNames.includes(item.name)?'Disabled in settings':item.available===false?item.unavailableReason??'Currently unavailable':''):''})).filter((item:any)=>(item.name+' '+(item.description??'')).toLowerCase().includes(token?.query.toLowerCase()??''));
 useEffect(()=>setSelected(Math.max(0,entries.findIndex((item:any)=>!item.blocked))),[token?.kind,token?.query,catalog,skills]);
 useEffect(()=>{if(open)document.getElementById(id+'-'+selected)?.scrollIntoView({block:'nearest'});},[open,selected,id]);
 const pick=(item:any)=>{if(!token||item.blocked)return;const next=insertMention(text,token,item.name);setText(next.text);setDismissed(next.text+':'+next.caret);requestAnimationFrame(()=>{field.current?.focus();field.current?.setSelectionRange(next.caret,next.caret);setCaret(next.caret);});};
 const keyDown=(event:any)=>{
  if(!open||event.nativeEvent.isComposing)return false;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setDismissed(key);return true;}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const usable=entries.map((item:any,index:number)=>item.blocked?-1:index).filter((index:number)=>index>=0);if(usable.length){const position=usable.indexOf(selected);setSelected(usable[(position+(event.key==='ArrowDown'?1:-1)+usable.length)%usable.length]);}return true;}
  if((event.key==='Enter'&&!event.shiftKey||event.key==='Tab'&&!event.shiftKey)&&entries[selected]&&!entries[selected].blocked){event.preventDefault();pick(entries[selected]);return true;}return false;
 };
 const menu=open&&<div className="composer-mention-menu" onMouseDown={event=>event.preventDefault()}><div className="mention-heading">{token.kind==='tool'?'Tools':'Installed skills'}<small>{entries.length} · ↑↓ select · Enter / Tab</small></div><div id={id} role="listbox" aria-label={token.kind==='tool'?'Tools':'Skills'} className="mention-options">{entries.map((item:any,index:number)=><button type="button" id={id+'-'+index} key={item.id??item.name} role="option" aria-selected={selected===index} aria-disabled={!!item.blocked} className={item.blocked?'unavailable':''} onMouseEnter={()=>setSelected(index)} onClick={()=>pick(item)}>{token.kind==='tool'?<Wrench size={16}/>:<BookOpen size={16}/>}<span><strong>{token.kind==='tool'?'/':'@'}{item.name}</strong><small>{item.blocked||item.description}</small></span></button>)}{!entries.length&&<p className="empty-note">{loading?'Loading tools…':error|| (token.kind==='tool'?'No matching tools.':'No matching installed skills.')}</p>}</div></div>;
 return {menu,keyDown,inputProps:{'aria-autocomplete':'list' as const,'aria-controls':open?id:undefined,'aria-expanded':open,'aria-activedescendant':open&&entries[selected]?id+'-'+selected:undefined,onFocus:(event:any)=>{setFocused(true);setCaret(event.currentTarget.selectionStart);},onBlur:()=>setFocused(false),onSelect:(event:any)=>setCaret(event.currentTarget.selectionStart)},change:(event:any)=>{setText(event.target.value);setCaret(event.target.selectionStart);}};
}
