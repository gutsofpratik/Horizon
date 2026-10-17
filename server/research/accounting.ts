import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {getDomain} from 'tldts';

export interface EvidenceSource {id:string;url:string;originalUrl:string;title:string;domain:string;text:string;digest:string;retrievedAt:string;query:string;note:string}

/** Accounting only: the fetch adapter must separately resolve DNS and enforce public network access. */
export function websiteDomain(address:string):string|null {
 try {
  const url=new URL(address);const hostname=url.hostname.toLowerCase().replace(/^\[|\]$/g,'').replace(/\.$/,'');
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||isIP(hostname)||!hostname.includes('.'))return null;
  if(/(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|onion)$/.test(hostname))return null;
  return getDomain(hostname,{allowPrivateDomains:true})??null;
 }catch{return null;}
}
const normalizedText=(text:string)=>text.normalize('NFKC').replace(/[\u200b-\u200d\ufeff]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
const digestOf=(text:string)=>createHash('sha256').update(normalizedText(text)).digest('hex');
function challengePage(title:string,text:string):boolean {
 const heading=title.toLowerCase();const start=text.slice(0,2000).toLowerCase();
 if(/^(?:just a moment|attention required|access denied|security check|verify (?:you are|you're) human)/.test(heading))return true;
 return /(?:verify (?:you are|you're) human|checking your browser before accessing|performing security verification|please complete the security check|enable javascript and cookies to continue|unusual traffic from your computer network|captcha verification required)/.test(start);
}
export function acceptEvidence(existingSources:any[],page:{url:string;title?:string;text?:string;bytes?:unknown},origin:{url:string;query:string},id:string):{source?:EvidenceSource;reason?:string} {
 const domain=websiteDomain(page.url);
 if(!domain)return {reason:'The final page URL is not a public website.'};
 if(page.bytes!==undefined)return {reason:'Binary/PDF content has not been extracted into readable evidence.'};
 const text=page.text?.trim()??'';const title=page.title?.trim()||domain;
 if(challengePage(title,text))return {reason:'The page is an access challenge, not readable evidence.'};
 if((text.match(/[\p{L}\p{N}]/gu)??[]).length<300)return {reason:'The page contains fewer than 300 meaningful text characters; snippets do not count as a scan.'};
 if(existingSources.some(source=>(source.domain??websiteDomain(source.url))===domain))return {reason:'This final destination website has already been counted.'};
 const digest=digestOf(text);
 if(existingSources.some(source=>source.digest===digest||typeof source.text==='string'&&digestOf(source.text)===digest))return {reason:'This page duplicates evidence already read from another website.'};
 const url=new URL(page.url);url.hash='';
 return {source:{id,url:url.href,originalUrl:origin.url,title,domain,text:text.slice(0,12000),digest,retrievedAt:new Date().toISOString(),query:origin.query,note:''}};
}
export function countSites(sources:any[]):number {
 return new Set(sources.map(source=>websiteDomain(source.url)).filter((domain):domain is string=>domain!==null)).size;
}
