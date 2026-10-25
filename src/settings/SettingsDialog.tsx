import {useEffect,useRef,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';

export function SettingsDialog({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current;if(!dialog)return;const previous=document.activeElement as HTMLElement|null;dialog.showModal();return()=>{dialog.close();previous?.focus();};},[]);
 return createPortal(<dialog ref={ref} className="dialog settings-task-dialog" aria-label={title} onCancel={event=>{event.preventDefault();onClose();}} onKeyDown={event=>event.stopPropagation()} onClick={event=>{if(event.target===event.currentTarget){const rect=event.currentTarget.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)onClose();}}}>
  <header className="dialog-heading"><h2>{title}</h2><button type="button" className="icon-button" aria-label={'Close '+title} onClick={onClose}><X size={17}/></button></header>{children}
 </dialog>,document.body);
}
