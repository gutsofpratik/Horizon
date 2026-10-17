import {ToolError} from '../tools/registry.ts';
export const externalSearchProviders=['brave','tavily','custom'];
export function searchApiUrl(value:string){
 let url:URL;try{url=new URL(value);}catch{throw new ToolError('SEARCH_CONFIGURATION','Enter a valid search API URL');}
 if(url.username||url.password||url.hash||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new ToolError('SEARCH_CONFIGURATION','Search API URL must use HTTPS (HTTP is allowed for localhost), without credentials or a fragment');
 return url;
}
export async function searchExternal(settings:Record<string,any>,query:string,limit:number,timeRange:string,signal:AbortSignal,page:number){
 const mode=settings.searchProvider,key=settings.searchApiKeys?.[mode]??settings.searchApiKey;
 if(mode!=='custom'&&!key)throw new ToolError('SEARCH_CONFIGURATION','Add the selected search provider API key in Settings → Tools & search');
 const count=Math.max(1,Math.min(20,Math.floor(limit)));
 const provider=mode==='brave'?'https://api.search.brave.com/res/v1/web/search':mode==='tavily'?'https://api.tavily.com/search':searchApiUrl(settings.searchApiUrl??'').href;
 if(mode==='tavily'&&page>1||mode==='brave'&&page>10)return {provider,body:{results:[]},paginationSupported:false};
 const url=new URL(provider);const headers:Record<string,string>={Accept:'application/json'};
 const init:RequestInit={headers,signal,redirect:'error'};
 if(mode==='tavily'){
  headers['Content-Type']='application/json';headers.Authorization='Bearer '+key;init.method='POST';
  init.body=JSON.stringify({query,max_results:count,include_answer:false,include_raw_content:false,...(timeRange!=='any'?{time_range:timeRange}:{})});
 }else{
  url.searchParams.set('q',query);
  if(mode==='brave'){
   headers['X-Subscription-Token']=key;url.searchParams.set('count',String(count));url.searchParams.set('offset',String(page-1));
   url.searchParams.set('search_lang',settings.searchLanguage??'en');url.searchParams.set('safesearch',['off','moderate','strict'][settings.safeSearch??1]??'moderate');
   const freshness:Record<string,string>={day:'pd',week:'pw',month:'pm',year:'py'};if(freshness[timeRange])url.searchParams.set('freshness',freshness[timeRange]);
  }else{
   if(key)headers.Authorization='Bearer '+key;
   url.searchParams.set('limit',String(count));url.searchParams.set('page',String(page));url.searchParams.set('time_range',timeRange);url.searchParams.set('language',settings.searchLanguage??'en');url.searchParams.set('safesearch',String(settings.safeSearch??1));
  }
 }
 let response:Response;try{response=await fetch(url,init);}catch(error){if(signal.aborted)throw error;throw new ToolError('SEARCH_UNAVAILABLE','Search API request failed; check the endpoint and network connection');}
 if(!response.ok)throw new ToolError(response.status===429?'SEARCH_RATE_LIMITED':'SEARCH_UNAVAILABLE',`Search API returned HTTP ${response.status}; check credentials and provider quota`);
 let body:any;try{body=await response.json();}catch{throw new ToolError('SEARCH_RESPONSE_INVALID','Search API did not return JSON');}
 const results=mode==='brave'?body.web?.results??[]:body.results;
 if(!Array.isArray(results))throw new ToolError('SEARCH_RESPONSE_INVALID','Search API response must contain a results array');
 return {provider,body:{results:results.filter(item=>item&&typeof item==='object').map(item=>({title:item.title,url:item.url,content:item.content??item.description??item.snippet??''}))},paginationSupported:mode!=='tavily'};
}
