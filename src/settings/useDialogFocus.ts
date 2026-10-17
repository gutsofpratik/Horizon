import {useEffect,useRef} from 'react';
export function useDialogFocus(onClose:()=>void){
 const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const dialog=document.querySelector<HTMLElement>('.settings-dialog');if(!dialog)return;
 const elements=()=>Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')).filter(element=>element.getClientRects().length>0);
 elements()[0]?.focus();const handle=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();close.current();}if(event.key==='Tab'){const items=elements();const first=items[0],last=items[items.length-1];if(event.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){event.preventDefault();last?.focus();}else if(!event.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){event.preventDefault();first?.focus();}}};dialog.addEventListener('keydown',handle);return()=>{dialog.removeEventListener('keydown',handle);previous?.focus();};
 },[]);
}
