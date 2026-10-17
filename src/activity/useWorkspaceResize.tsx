import {useLayoutEffect,useRef,useState} from 'react';
const key='openclaude.workspace.width',initial=430;
export function useWorkspaceResize(){
 const panel=useRef<HTMLElement>(null);const drag=useRef<{x:number;width:number}|null>(null);
 const [width,setWidth]=useState(()=>{try{const saved=Number(localStorage.getItem(key));return saved>=280?saved:initial;}catch{return initial;}});
 const bounds=()=>{
  const element=panel.current,main=element?.parentElement?.querySelector('.app-main');
  const other=element?.parentElement?.querySelector('.artifact-panel')?.getBoundingClientRect().width??0;
  return {min:280,max:Math.max(280,(element?.parentElement?.getBoundingClientRect().right??window.innerWidth)-(main?.getBoundingClientRect().left??0)-other-320)};
 };
 const resize=(value:number)=>{const {min,max}=bounds();setWidth(Math.round(Math.max(min,Math.min(max,value))));};
 const persist=(value:number)=>{try{localStorage.setItem(key,String(value));}catch{}};
 useLayoutEffect(()=>{const adjust=()=>setWidth(value=>{const {min,max}=bounds();return Math.max(min,Math.min(max,value));});adjust();window.addEventListener('resize',adjust);return()=>window.removeEventListener('resize',adjust);},[]);
 const limits=bounds();
 const handle=<div className="workspace-resize-handle" role="separator" tabIndex={0} aria-label="Resize workspace" aria-orientation="vertical" aria-valuenow={width} aria-valuemin={limits.min} aria-valuemax={limits.max} title="Drag to resize · Double-click to reset"
  onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();drag.current={x:event.clientX,width};event.currentTarget.setPointerCapture(event.pointerId);event.currentTarget.classList.add('resizing');}}
  onPointerMove={event=>{if(drag.current)resize(drag.current.width+drag.current.x-event.clientX);}}
  onPointerUp={event=>{if(!drag.current)return;drag.current=null;persist(panel.current?.getBoundingClientRect().width??width);event.currentTarget.classList.remove('resizing');if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
  onLostPointerCapture={event=>{drag.current=null;event.currentTarget.classList.remove('resizing');}}
  onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const {min,max}=bounds();const step=event.shiftKey?80:20;const next=event.key==='Home'?min:event.key==='End'?max:width+(event.key==='ArrowLeft'?step:-step);resize(next);persist(Math.max(min,Math.min(max,next)));}}
  onDoubleClick={()=>{resize(initial);persist(initial);}}><span/></div>;
 return {panel,width,handle};
}
