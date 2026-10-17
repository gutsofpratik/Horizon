import {parseHTML} from 'linkedom';
import {ToolError} from '../tools/registry.ts';

export async function searchDuckDuckGo(query:string,timeRange:string,signal:AbortSignal,settings:Record<string,any>={}){
 const endpoint=new URL('https://html.duckduckgo.com/html/');
 endpoint.searchParams.set('q',query);
 // Provider parameters: https://duckduckgo.com/duckduckgo-help-pages/settings/params
 const regions:Record<string,string>={en:'us-en',fr:'fr-fr',de:'de-de',es:'es-es',it:'it-it',pt:'pt-pt',nl:'nl-nl',ja:'jp-jp',ko:'kr-kr',ru:'ru-ru',zh:'cn-zh',ar:'xa-ar',pl:'pl-pl',sv:'se-sv',tr:'tr-tr'};
 const language=settings.searchLanguage??'en';const region=language==='all'?'wt-wt':regions[language];
 if(!region)throw new ToolError('SEARCH_CONFIGURATION',`DuckDuckGo does not support the configured language '${language}' in this build. Select SearXNG or a supported language.`);
 const safeSearch=Number(settings.safeSearch??1);
 if(![0,1,2].includes(safeSearch))throw new ToolError('SEARCH_CONFIGURATION','SafeSearch must be 0 (off), 1 (moderate), or 2 (strict)');
 endpoint.searchParams.set('kl',region);endpoint.searchParams.set('kp',safeSearch===2?'1':safeSearch===1?'-1':'-2');
 const range:Record<string,string>={day:'d',month:'m',year:'y'};
 if(range[timeRange])endpoint.searchParams.set('df',range[timeRange]);
 let response:Response;
 try{response=await fetch(endpoint,{signal});}catch(error){if(signal.aborted)throw error;throw new ToolError('SEARCH_UNAVAILABLE','Cannot reach DuckDuckGo: '+(error as Error).message);}
 if(response.status===202||response.status===403||response.status===429)throw new ToolError('SEARCH_BLOCKED','DuckDuckGo blocked this request or requires a challenge. Try again later or select SearXNG in Settings.');
 if(!response.ok)throw new ToolError('SEARCH_UNAVAILABLE','DuckDuckGo returned HTTP '+response.status);
 const html=await response.text();
 if(html.length>2*1024*1024)throw new ToolError('SEARCH_RESPONSE_INVALID','Search response is too large');
 const {document}=parseHTML(html);
 if(document.querySelector('#challenge-form, .anomaly-modal'))throw new ToolError('SEARCH_BLOCKED','DuckDuckGo requires a challenge. Try again later or select SearXNG in Settings.');
 const results=[...document.querySelectorAll('.result')].flatMap(item=>{
  const link=item.querySelector('.result__a');if(!link)return [];
  let url:string;try{const target=new URL(link.getAttribute('href')??'',endpoint);url=target.searchParams.get('uddg')??target.href;}catch{return [];}
  return [{url,title:link.textContent,content:item.querySelector('.result__snippet')?.textContent??''}];
 });
 if(!results.length&&!document.querySelector('.no-results'))throw new ToolError('SEARCH_RESPONSE_INVALID','DuckDuckGo returned an unrecognized results page');
 return {results,unresponsive_engines:[]};
}
