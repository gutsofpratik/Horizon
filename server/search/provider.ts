import ipaddr from 'ipaddr.js';
import {searchDuckDuckGo} from './duckduckgo.ts';
import {externalSearchProviders,searchExternal} from './external.ts';
import {createHash} from 'node:crypto';
import {randomUUID} from 'node:crypto';import {isIP} from 'node:net';import type {AppContext} from '../app.ts';import {ToolError} from '../tools/registry.ts';
const plain=(text:any)=>String(text??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
export function normalizeSearch(body:any,limit:number):any[]{const seen=new Set<string>();const results=[];for(const item of body.results??[]){let url:URL;try{url=new URL(item.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)continue;}catch{continue;}url.hash='';if(seen.has(url.href))continue;seen.add(url.href);results.push({source_id:randomUUID(),title:plain(item.title).slice(0,500),url:url.href,excerpt:plain(item.content).slice(0,2000),retrieved_at:new Date().toISOString()});if(results.length>=limit)break;}return results;}
export function publicAddress(address:string):boolean{
 address=address.toLowerCase().replace(/^\[|\]$/g,'');
 if(!isIP(address))return false;
 try{return ipaddr.process(address).range()==='unicast';}catch{return false;}
}
async function searchSearXNG(endpoint:URL,signal:AbortSignal){
 let response:Response;try{response=await fetch(endpoint,{signal});}catch(error){if(signal.aborted)throw error;throw new ToolError('SEARCH_UNAVAILABLE',`Cannot reach search provider at ${endpoint.origin}: ${(error as Error).message}. Start SearXNG or select Automatic / DuckDuckGo in Settings → Tools & search.`);}
 if(response.status===403)throw new ToolError('SEARCH_JSON_DISABLED','Enable json in the SearXNG search.formats setting');
 if(response.status===429)throw new ToolError('SEARCH_RATE_LIMITED','Search provider is rate limited');
 if(!response.ok)throw new ToolError('SEARCH_UNAVAILABLE',`Search provider returned HTTP ${response.status}`);
 let body:any;try{body=await response.json();}catch{throw new ToolError('SEARCH_RESPONSE_INVALID','Search provider did not return JSON');}
 if(!Array.isArray(body.results))throw new ToolError('SEARCH_RESPONSE_INVALID','Search response is missing results');return body;
}
export async function searchWeb(app:AppContext,query:string,limit=5,timeRange='any',signal?:AbortSignal,page=1){
 const settings:Record<string,any>=app.store.get('settings','main')??{};
 const mode=settings.searchProvider??'auto';
 if(!['auto','searxng','duckduckgo',...externalSearchProviders].includes(mode))throw new ToolError('SEARCH_CONFIGURATION','Select a valid search provider in Settings');
 const key='search:'+JSON.stringify([mode,mode==='duckduckgo'?null:settings.searchUrl,settings.searchApiUrl,createHash('sha256').update(settings.searchApiKeys?.[mode]??settings.searchApiKey??'').digest('hex'),query,limit,timeRange,page,settings.searchLanguage??'en',settings.safeSearch??1]);const cached=app.ephemeral.get(key);
 if(cached&&Date.now()-cached.time<300000)return {...cached.data,cached:true};
 let body:any,provider=mode==='duckduckgo'?'https://html.duckduckgo.com':String(settings.searchUrl||'http://127.0.0.1:8081'),fallback=false,paginationSupported=true;
 const makeSignal=(timeout:number)=>signal?AbortSignal.any([signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout);
 try{
  if(externalSearchProviders.includes(mode)){const result=await searchExternal(settings,query,limit,timeRange,makeSignal(20000),page);body=result.body;provider=result.provider;paginationSupported=result.paginationSupported;}
  else if(mode==='duckduckgo'){paginationSupported=false;if(page>1)return {query,provider,fallback,sources:[],engineWarnings:[],cached:false,paginationSupported:false};body=await searchDuckDuckGo(query,timeRange,makeSignal(20000),settings);}
  else{try{let endpoint:URL;try{endpoint=new URL('/search',provider);if(!['http:','https:'].includes(endpoint.protocol))throw new Error('Use HTTP(S)');}catch{throw new ToolError('SEARCH_CONFIGURATION','Enter a valid HTTP(S) SearXNG URL in Settings → Tools & search');}endpoint.search=new URLSearchParams({q:query,format:'json',language:settings.searchLanguage??'en',safesearch:String(settings.safeSearch??1),pageno:String(page),...(timeRange!=='any'?{time_range:timeRange}:{})}).toString();provider=endpoint.origin;body=await searchSearXNG(endpoint,makeSignal(mode==='auto'?5000:20000));}catch(error){if(signal?.aborted||mode!=='auto')throw error;provider='https://html.duckduckgo.com';fallback=true;if(page>1)return {query,provider,fallback,sources:[],engineWarnings:[],cached:false,paginationSupported:false};body=await searchDuckDuckGo(query,timeRange,makeSignal(20000),settings);}}
  const data={query,provider,fallback,sources:normalizeSearch(body,limit),engineWarnings:body.unresponsive_engines??[],cached:false,paginationSupported:fallback?false:paginationSupported};
  app.ephemeral.set(key,{time:Date.now(),data});app.ephemeral.set('searchHealth',{ready:true,provider,fallback,lastTest:new Date().toISOString(),results:data.sources.length});return data;
 }catch(error){app.ephemeral.set('searchHealth',{ready:false,provider,error:(error as Error).message});throw error;}
}
