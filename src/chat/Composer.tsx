import {SketchDialog} from './SketchDialog';
import {composerModes} from './ComposerModes';
import {useComposerMentions} from './use-composer-mentions';
import {useRef,useEffect,useState} from 'react';

import {ArrowUp,Plus,Square,Mic,Paperclip,X} from 'lucide-react';import {ModelPicker} from './ModelPicker';import {ComposerMenu} from './ComposerMenu';

export function Composer({text,setText,onSend,running,onCancel,models,settings,onModel,onSettings,onRefresh,attachments,onUpload,onRemoveAttachment,projects,projectId,onProject,onCustomize,skills=[],tools=[],layout='welcome',memoryEnabled=true,onMemoryChange,onError,onMode}:{[key:string]:any}){

 const menuAnchor=useRef<HTMLButtonElement>(null);const field=useRef<HTMLTextAreaElement>(null);const file=useRef<HTMLInputElement>(null);const [menu,setMenu]=useState(false);const [sketch,setSketch]=useState(false);const [dictating,setDictating]=useState(false);

 useEffect(()=>{if(field.current){field.current.style.height='auto';field.current.style.height=Math.min(field.current.scrollHeight,220)+'px';}},[text,layout]);

 useEffect(()=>{if(!menu)return;const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setMenu(false);};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[menu]);

 const mentions=useComposerMentions({text,setText,field,skills,tools,settings});
 const dictate=()=>{const Recognition=(window as any).SpeechRecognition??(window as any).webkitSpeechRecognition;if(!Recognition){onError?.('Dictation is not supported by this browser.');return;}const speech=new Recognition();speech.lang=settings.voiceLanguage??navigator.language;speech.interimResults=false;speech.onresult=(event:any)=>setText(text+' '+event.results[0][0].transcript);speech.onend=()=>setDictating(false);speech.onerror=()=>setDictating(false);speech.start();setDictating(true);};

 const picker=<ModelPicker disabled={running} thinking={settings.thinking} onThinking={(thinking:boolean)=>onSettings({...settings,thinking})} models={models} model={settings.model} providerId={settings.providerId} onChange={onModel} onRefresh={onRefresh}/>;

 const mode=settings.accessMode??'chat';

 return <div className={'composer-wrap '+layout+'-composer'} data-layout={layout}>{sketch&&<SketchDialog onClose={()=>setSketch(false)} onAttach={onUpload} onError={onError}/ >}{settings.composerMode&&settings.composerMode!=='chat'&&<div className="composer-mode-chip"><span>{composerModes.find(mode=>mode.id===settings.composerMode)?.label}</span><button aria-label="Clear workflow mode" onClick={()=>onSettings({...settings,composerMode:'chat'})}><X size={12}/></button></div>}{mentions.menu}<div className={'composer '+(attachments.length?'has-attachments':'')}>

 {attachments.length>0&&<div className="attachment-chips">{attachments.map((attachment:any)=><span className="attachment-chip" key={attachment.id}><Paperclip size={13}/>{attachment.name}<button aria-label={'Remove '+attachment.name} onClick={()=>onRemoveAttachment(attachment.id)}><X size={12}/></button></span>)}</div>}

 <textarea ref={field} {...mentions.inputProps} aria-label="Message" placeholder={running?'Add a follow-up to the queue…':layout==='welcome'?'How can I help you today?':'Write a message…'} value={text} onChange={mentions.change} onKeyDown={event=>{if(mentions.keyDown(event))return;if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();if(text.trim()||attachments.length)onSend();}}} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();onUpload([...event.dataTransfer.files]);}} rows={layout==='welcome'?2:1}/>

 <div className="composer-bottom"><div className="composer-actions"><button ref={menuAnchor} className="icon-button add-button" aria-label="Add files, skills, and tools" aria-expanded={menu} onClick={()=>setMenu(!menu)}><Plus size={19}/></button>

 {menu&&<ComposerMenu anchor={menuAnchor.current} onSelectMode={(mode:string)=>{onSettings({...settings,composerMode:mode});if(mode==='sketch')setSketch(true);onMode?.(mode);field.current?.focus();}} running={running} onError={onError} onRefresh={onRefresh} memoryEnabled={memoryEnabled} onMemoryChange={onMemoryChange} skills={skills} settings={settings} onSettings={onSettings} onUpload={()=>file.current?.click()} onCustomize={onCustomize} projects={projects} projectId={projectId} onProject={onProject} onClose={()=>setMenu(false)} onInvoke={(name:string)=>{setText('@'+(/\s/.test(name)?JSON.stringify(name):name)+' '+text);field.current?.focus();}}/>}

 <input ref={file} hidden type="file" multiple accept="image/*,.pdf,.docx,.txt,.md,.csv,.json,.js,.ts,.py,.html,.css,.xlsx,.pptx" onChange={event=>{onUpload([...event.target.files??[]]);event.target.value='';}}/>

 </div><div className="composer-actions">{layout==='welcome'&&picker}<button className={'icon-button '+(dictating?'dictating':'')} aria-label="Dictate" onClick={dictate}><Mic size={17}/></button>{running?<>{(text.trim()||attachments.length>0)&&<button className="send-button" aria-label="Queue message" onClick={onSend}><ArrowUp size={18}/></button>}<button className="send-button stop" aria-label="Stop generation" onClick={onCancel}><Square size={15} fill="currentColor"/></button></>:<button className="send-button" aria-label="Send message" disabled={!text.trim()&&!attachments.length||!settings.model} onClick={onSend}><ArrowUp size={18}/></button>}</div></div></div>

 <div className="composer-meta"><div className="composer-scope">{projectId?projects.find((project:any)=>project.id===projectId)?.name:''}</div><div className="composer-meta-right">{layout==='conversation'&&picker}</div></div></div>;

}
