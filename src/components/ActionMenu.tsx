import {useEffect,useRef,useState} from 'react';
import {Ellipsis} from 'lucide-react';
export function ActionMenu({label='More actions',items}:{label?:string;items:{label:string;action:()=>void;disabled?:boolean;danger?:boolean}[]}){
 const [open,setOpen]=useState(false);const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!open)return;const close=(event:PointerEvent)=>{if(!ref.current?.contains(event.target as Node))setOpen(false);};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);};document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};},[open]);
 return <div ref={ref} className="compact-action-menu"><button type="button" className="icon-button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(!open)}><Ellipsis size={17}/></button>{open&&<div role="menu">{items.map(item=><button key={item.label} role="menuitem" type="button" disabled={item.disabled} className={item.danger?'danger':''} onClick={()=>{setOpen(false);item.action();}}>{item.label}</button>)}</div>}</div>;
}
