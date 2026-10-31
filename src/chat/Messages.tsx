import {groupedActivities} from './tool-families';
import {responsePhaseLabel,prefillProgressLabel} from './response-status';


import {ResearchProgress} from './ResearchProgress';

import {MemoryResults} from './MemoryResults';

import {FileResults} from './FileResults';

import {PlanResults} from './PlanResults';



import {artifactPhase} from './artifact-phase';

import {responsePhases} from './response-phases';

import {responseActivities,responseBranches} from './response-activities';

import {responseGroups} from './response-groups';

import {artifactAnchor} from './artifact-placement';

import {useState,useEffect,useRef} from 'react';

import {Copy,Check,RotateCcw,Pencil,Volume2,ChevronDown,ChevronLeft,ChevronRight,Paperclip,AlertCircle,Loader2,FileCode,ArrowUpRight} from 'lucide-react';

import {Markdown} from '../components/Markdown';

import {readAloud} from '../settings/voice';

export function visibleMessages(conversation:any){if(!conversation)return [];const all=conversation.messages??[];if(!conversation.headId)return all.filter((message:any)=>message.role!=='tool');const map=new Map<string,any>(all.map((message:any)=>[message.id,message]));const chain:any[]=[];const seen=new Set();let id=conversation.messagePageHeadId??conversation.headId;while(id&&!seen.has(id)){seen.add(id);const message=map.get(id);if(!message)break;chain.unshift(message);id=message.parentId;}return chain.filter(message=>message.role!=='tool'&&(message.role!=='assistant'||message.content||message.reasoning||message.status==='generating'||message.tool_calls?.length||message.runId===conversation.activeRunId&&conversation.activeRunId||message.error));}

function Message({message,siblings,onRetry,onEdit,onFeedback,onBranch,artifactCards,allMessages,activities,voiceSettings,running,research,onResearchResume,onArtifact}:any){

 const [copied,setCopied]=useState(false);const isUser=message.role==='user';const generating=message.status==='generating'||(!isUser&&running);

 const copy=async()=>{await navigator.clipboard.writeText(message.content);setCopied(true);setTimeout(()=>setCopied(false),1500);};const index=siblings.findIndex((item:any)=>(item.firstMessageId??item.id)===(message.firstMessageId??message.id));

 return <article className={`message ${isUser?'user-message':'assistant-message'}`} aria-label={isUser?'Your message':'Assistant response'}>

  {message.attachments?.length>0&&<div className="message-attachments">{message.attachments.map((file:any)=><a key={file.id} href={file.url} target="_blank" rel="noopener"><Paperclip size={15}/>{file.name}</a>)}</div>}

  {isUser?<>{artifactCards(message,0,[message])}{message.content&&<Markdown text={message.content}/>}</>:responsePhases(message,activities).map((phase:any,index:number,phases:any[])=>{const phaseIds=new Set(phase.toolMessageIds??phase.messageIds);const live=activities.filter((item:any)=>item.messageId?phaseIds.has(item.messageId):index===phases.length-1);const tools=responseActivities(phase,allMessages,live).map((item:any)=>!running&&!item.result?{...item,result:{status:'interrupted',summary:'Work stopped'}}:item);return <ResponsePhase files={<><MemoryResults tools={tools}/><PlanResults tools={tools}/><FileResults tools={tools}/></>} key={phase.renderKey} message={phase} activity={tools.length?<InlineActivity activities={tools}/>:null} activeToolName={tools.filter((item:any)=>!item.result).at(-1)?.name} workingWithTools={tools.some((item:any)=>!item.result&&item.phase!=='preparing')} artifactCards={artifactCards(phase,index,phases)}/>;})}

  {research&&research.runId===message.runId&&<ResearchProgress research={research} onResume={!running?onResearchResume:undefined} onArtifact={(id:string)=>onArtifact({id})}/>}

  {message.error&&<div className="message-error"><AlertCircle size={16}/>{message.error}</div>}

  {!generating&&<div className="message-actions">{siblings.length>1&&<div className="branch-controls"><button aria-label="Previous branch" disabled={index===0} onClick={()=>onBranch(siblings[index-1].id)}><ChevronLeft size={14}/></button><span>{index+1} / {siblings.length}</span><button aria-label="Next branch" disabled={index===siblings.length-1} onClick={()=>onBranch(siblings[index+1].id)}><ChevronRight size={14}/></button></div>}<button aria-label="Copy message" title={copied?'Copied':'Copy'} onClick={copy}>{copied?<Check size={15}/>:<Copy size={15}/>}</button>{isUser?<><button aria-label="Edit message" title="Edit" onClick={()=>onEdit(message)}><Pencil size={15}/></button><button aria-label="Retry message" title="Retry" onClick={()=>onRetry(message)}><RotateCcw size={15}/></button></>:<><button aria-label="Read aloud" title="Read aloud" onClick={()=>{readAloud(message.content,voiceSettings??{});}}><Volume2 size={15}/></button><button aria-label="Retry message" title="Retry" onClick={()=>onRetry({...message,id:message.firstMessageId??message.id})}><RotateCcw size={15}/></button></>}</div>}

 </article>;

}

export function Messages({conversation,onRetry,onEdit,onFeedback,onBranch,activities=[],artifacts=[],onArtifact,running,selectedArtifactId,voiceSettings,research,onResearchResume,activeRunId}:any){const visible=visibleMessages(conversation).map((message:any)=>!running&&message.role==='assistant'&&message.status==='generating'?{...message,status:'interrupted'}:message);const messages=responseGroups(visible,running?(activeRunId??conversation?.activeRunId):undefined);return <div className="messages" role="feed" aria-label="Chat messages">{messages.map((message:any)=>{return <div key={message.renderKey} className="message-turn"><Message running={running} research={research} onResearchResume={onResearchResume} onArtifact={(item:any)=>{const found=artifacts.find((artifact:any)=>artifact.id===item.id);if(found)onArtifact(found);}} voiceSettings={voiceSettings} key={message.renderKey} message={message} siblings={responseBranches(message,conversation.messages??[])} onRetry={onRetry} onEdit={onEdit} onFeedback={onFeedback} onBranch={onBranch} allMessages={conversation.messages??[]} activities={activities} artifactCards={(phase:any,index:number,phases:any[])=><div className="chat-artifacts">{artifacts.filter((item:any)=>item.conversationId===conversation?.id&&(conversation.messageArtifactAnchors?.[item.id]??artifactAnchor(item,messages,conversation.messages??[]))===message.id&&artifactPhase(item,phases,conversation.messages??[])===index).map((item:any)=><button key={item.id} className={`chat-artifact-card ${selectedArtifactId===item.id?'artifact-open':''}`} onClick={()=>onArtifact(item)}><span className="artifact-card-icon"><FileCode size={23}/></span><span><strong>{item.title}</strong><small>{item.type} · version {item.version} · Click to open</small></span><span className="artifact-card-action">{selectedArtifactId===item.id?'Hide':'Open'}</span></button>)}</div>}/></div>;})}

 </div>;}



function InlineActivity({activities}:any){return <div className="thinking-tools">

 

 <div className="activity-steps">{groupedActivities(activities).map((group,groupIndex)=><details className="tool-family" key={groupIndex} open={group.name!=='Memory'&&group.items.some((item:any)=>!item.result)}><summary>{group.name==='Memory'?'Using memories':'Using '+group.name.toLowerCase()}<small>{group.items.length} {group.items.length===1?'action':'actions'}</small></summary>{group.items.map((item:any,index:number)=>{const args=item.arguments??{};const detail=args.query??args.url??item.result?.data?.query??item.result?.data?.url;const status=item.result?.status??(item.phase==='preparing'?'Preparing':'Running');return <div className="thinking-tool" key={item.callId??index}>

 <div className="thinking-tool-heading"><span>{(item.name??'tool').replaceAll('_',' ')}</span><small>{status}</small></div>

 {detail&&<div className="thinking-tool-detail">{String(detail)}</div>}

 {item.result?.error?.message&&<p className="thinking-tool-error">{item.result.error.message}</p>}

 {item.result?.data?.sources?.length>0&&<div className="thinking-tool-sources">{item.result.data.sources.slice(0,5).filter((source:any)=>/^https?:\/\//.test(source.url)).map((source:any)=><a key={source.source_id??source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.title||source.url}<ArrowUpRight size={11}/></a>)}</div>}

 </div>;})}</details>)}</div>

 {activities.some((item:any)=>['artifact_create','artifact_update'].includes(item.name)&&!item.result)&&<div className="artifact-drafting" role="status"><FileCode size={23}/><div><strong>Drafting artifact…</strong><span className="draft-lines"><i/><i/><i/></span></div></div>}

 </div>;}



function ResponsePhase({message,activity,workingWithTools,activeToolName,artifactCards,files}:any){const [thinking,setThinking]=useState(false);const revealed=useRef(false);const generating=message.status==='generating';const [statusTick,setStatusTick]=useState(0);useEffect(()=>{if(!generating)return;const timer=setInterval(()=>setStatusTick(value=>value+1),4000);return()=>clearInterval(timer);},[generating]);const phaseLabel=responsePhaseLabel(message,workingWithTools,activeToolName,statusTick);useEffect(()=>{if(generating&&message.reasoning&&!revealed.current){revealed.current=true;setThinking(true);}},[generating,message.reasoning]);const isUser=false;return <div className="response-phase">

  {!isUser&&(message.reasoning||activity||generating)&&<div className={`thinking-block ${generating?'thinking-live':''}`}><button aria-expanded={thinking} onClick={()=>setThinking(!thinking)}><span className={generating?'thinking-shimmer':''}>{phaseLabel}</span><ChevronDown size={14} className={thinking?'rotated':''}/></button>{thinking&&<div className="reasoning-content">{activity}{generating&&message.engineStage==='tool_arguments'&&message.generationProgress&&<p className="reasoning-caption" role="status">Preparing tool call · {message.generationProgress.characters.toLocaleString()} characters</p>}{message.reasoning&&<><p className="reasoning-caption">{message.reasoningMode==='summary'?'Model-generated approach summary.':'Reasoning returned by your selected model.'}</p><Markdown text={message.reasoning}/></>}{!message.reasoning&&!activity&&message.engineStage!=='prefill'&&<span className="muted">{phaseLabel}</span>}</div>}</div>}

 {artifactCards}{message.content&&<Markdown text={message.content}/>} {files}</div>;}


