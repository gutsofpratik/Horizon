import {useState} from 'react';
import {ChevronDown,ChevronRight,Search,FileText,RotateCcw} from 'lucide-react';

export interface ResearchRecord {
 id:string;strategy:string;target:number;stage:string;status:string;
 domains:number|string[];pages:number|unknown[];failures:number|unknown[];
 queryLog:unknown[];plan:unknown;skills:unknown[];
 sources:{url:string;title?:string;domain?:string}[];
 excluded?:number;failureReasons?:{reason:string;count:number}[];reason?:string;reportArtifactId?:string;inventoryFile?:string|{id?:string;url?:string;name?:string};
}
const count=(value:number|unknown[]|undefined)=>Array.isArray(value)?value.length:Math.max(0,Number(value)||0);
const label=(value:unknown):string=>typeof value==='string'?value:typeof value==='object'&&value!==null?String((value as any).query??(value as any).title??(value as any).name??(value as any).id??(value as any).reason??(value as any).error??JSON.stringify(value)):String(value??'');
const safeURL=(value:string)=>{try{const url=new URL(value,window.location.origin);return ['http:','https:'].includes(url.protocol)?url.href:undefined;}catch{return undefined;}};
export function ResearchProgress({research,onResume,onArtifact}:{research:ResearchRecord;onResume?:(id:string)=>void;onArtifact?:(id:string)=>void}){
 const [expanded,setExpanded]=useState(false);
 const domains=count(research.domains),pages=count(research.pages),failures=count(research.failures);
 const deepSearch=research.strategy==='deep_search';const target=Math.max(100,Number(research.target)||100);
 // Even a stale or invalid server snapshot must never claim a completed scan below its threshold.
 const status=deepSearch&&research.status==='completed'&&domains<target?'partial':research.status;
 const active=['running','planning','pending'].includes(status);const title=deepSearch?'Deep Search':'Deep Research';
 const statusLabel=({completed:'Completed',partial:'Partial results',cancelled:'Stopped',interrupted:'Interrupted',failed:'Failed'} as Record<string,string>)[status]??(deepSearch?({planning:'Searching',discovery:'Searching',reading:'Reading websites',analysis:'Comparing results',synthesis:'Preparing answer',expanding_queries:'Searching more websites'} as Record<string,string>)[research.stage]??'Searching':research.stage.replaceAll('_',' '));
 const inventory=typeof research.inventoryFile==='string'?research.inventoryFile:research.inventoryFile?.url??(research.inventoryFile?.id?'/api/files/'+encodeURIComponent(research.inventoryFile.id):undefined);
 const inventoryURL=inventory?safeURL(inventory):undefined;
 return <section className={'research-progress '+(active?'is-running':'')} aria-label={title+' activity'} data-research-status={status}>
  <button className="research-progress-toggle" aria-expanded={expanded} aria-controls={'research-details-'+research.id} onClick={()=>setExpanded(!expanded)}><Search size={15}/><span className="research-progress-title">{title}</span><span className="research-stage">{statusLabel}</span>{expanded?<ChevronDown size={14}/>:<ChevronRight size={14}/>}</button>
  <div className="research-counts" role="status" aria-live="polite"><span>{domains}{deepSearch?' / '+target:''} websites read</span><span>{pages} pages</span><span>{failures} failed requests</span>{!!research.excluded&&<span>{research.excluded} excluded pages</span>}</div>
  {deepSearch&&<progress aria-label="Successfully read websites" max={target} value={Math.min(domains,target)}/>}
  {research.reason&&<p className="research-reason">{research.reason}</p>}
  {expanded&&<div className="research-details" id={'research-details-'+research.id}>
   {!deepSearch&&!!research.plan&&<div><h4>Research plan</h4>{Array.isArray(research.plan)?<ol>{research.plan.map((item,index)=><li key={index}>{label(item)}</li>)}</ol>:<><ol>{((research.plan as any).questions??[]).map((question:string,index:number)=><li key={index}>{question}</li>)}</ol>{(research.plan as any).methodology&&<p className="research-plan-text">{(research.plan as any).methodology}</p>}</>}</div>}
   {!deepSearch&&!!research.skills?.length&&<div><h4>Skills used</h4><div className="research-skill-labels">{research.skills.map((skill,index)=><span key={index}>{label(skill)}</span>)}</div></div>}
   {!!research.queryLog?.length&&<div><h4>Search queries</h4><ol>{research.queryLog.map((query,index)=><li key={index}>{label(query)}</li>)}</ol></div>}
   {!!research.sources?.length&&<div><h4>Successfully read sources</h4><ol className="research-source-list">{research.sources.map((source,index)=><li key={source.url+index}>{safeURL(source.url)?<a href={safeURL(source.url)} target="_blank" rel="noopener noreferrer">{source.title||source.url}</a>:<span>{source.title||source.url}</span>}<small>{source.domain}</small></li>)}</ol></div>}
   {!!research.failureReasons?.length&&<div><h4>Unread pages</h4><ul>{research.failureReasons.map(item=><li key={item.reason}>{item.count} — {item.reason}</li>)}</ul></div>}
   {Array.isArray(research.failures)&&research.failures.length>0&&<div><h4>Failed reads</h4><ul>{research.failures.map((failure,index)=><li key={index}>{label(failure)}</li>)}</ul></div>}
  </div>}
  <div className="research-result-actions">{!deepSearch&&research.reportArtifactId&&onArtifact&&<button onClick={()=>onArtifact(research.reportArtifactId!)}><FileText size={14}/>Open report</button>}{!deepSearch&&inventoryURL&&<a href={inventoryURL} download><FileText size={14}/>Source inventory</a>}{['partial','interrupted','cancelled','failed'].includes(status)&&onResume&&<button onClick={()=>onResume(research.id)}><RotateCcw size={14}/>{deepSearch?'Continue searching':'Resume research'}</button>}</div>
 </section>;
}
