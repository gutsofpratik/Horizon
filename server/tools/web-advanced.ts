import {z} from 'zod';
import {lookup} from 'node:dns/promises';
import {connect,isIP} from 'node:net';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fetchPage} from '../search/fetch.ts';
import {publicAddress} from '../search/provider.ts';
import {ToolError,ToolRegistry} from './registry.ts';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {workspaceRoot,safePath,registerFile,projectKey} from './files.ts';
import {downloadPublic} from './public-download.ts';

export async function lookupWithDeadline(host:string,signal?:AbortSignal,resolveHost:typeof lookup=lookup,timeoutMs=5000){
 signal?.throwIfAborted();let timer:ReturnType<typeof setTimeout>|undefined;let abort:()=>void=()=>{};
 try{return await Promise.race([resolveHost(host,{all:true}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new ToolError('DNS_TIMEOUT','DNS lookup exceeded its deadline')),timeoutMs);abort=()=>reject(signal?.reason??new ToolError('CANCELLED','DNS lookup cancelled'));signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();})]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export async function publicHost(host:string,signal?:AbortSignal){
 if(!host||host.length>253||/[\s/@:#?\\]/.test(host)&&!isIP(host))throw new ToolError('INVALID_HOST','Supply a hostname or public IP address');
 const addresses=isIP(host)?[{address:host,family:isIP(host)}]:await lookupWithDeadline(host,signal);
 if(!addresses.length||addresses.some(entry=>!publicAddress(entry.address)))throw new ToolError('PRIVATE_NETWORK','Only public internet addresses are allowed');
 return addresses;
}
export function registerAdvancedWebTools(registry:ToolRegistry){
 registry.register({name:'network_ping',capability:'web-fetch',description:'Send one ICMP echo to a resolved public host with a short deadline. Reports blocked or unavailable ICMP honestly; no address ranges or network scans.',input:z.object({hostname:z.string().min(1).max(253)}).strict(),handler:async(args,ctx)=>{const [address]=await publicHost(args.hostname,ctx.signal);if(address.family!==4)throw new ToolError('PING_IPV4_REQUIRED','ICMP ping currently supports public IPv4 targets');const started=Date.now();try{const result=await promisify(execFile)('ping',process.platform==='win32'?['-n','1','-w','3000',address.address]:process.platform==='darwin'?['-c','1','-W','3000',address.address]:['-c','1','-W','3',address.address],{signal:ctx.signal,timeout:5000,windowsHide:true,maxBuffer:10000});return {hostname:args.hostname,address:address.address,reachable:true,duration_ms:Date.now()-started,output:result.stdout.slice(0,4000)};}catch(error){ctx.signal.throwIfAborted();if((error as any).code==='ENOENT')throw new ToolError('PING_UNAVAILABLE','The system ping executable is not installed');return {hostname:args.hostname,address:address.address,reachable:false,duration_ms:Date.now()-started,reason:'ICMP echo did not complete; the host or network may block ping'};}}});
 registry.register({name:'web_download_file',capability:'web-fetch',description:'Download up to 25 MiB from a public HTTP(S) URL into a new registered workspace file. Validates DNS on every redirect, never sends credentials, and never executes downloaded content.',input:z.object({url:z.string().url(),output_name:z.string().min(1).max(120).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/).default('download.bin')}).strict(),handler:async(args,ctx)=>{if(ctx.incognito)throw new ToolError('PRIVATE_FILES_UNAVAILABLE','Downloads require a saved chat');const result=await downloadPublic(args.url,ctx.signal),directory=await safePath(workspaceRoot(ctx),'downloads');await mkdir(directory,{recursive:true});const path=await safePath(directory,randomUUID()+'-'+args.output_name);await writeFile(path,result.bytes,{flag:'wx'});return {url:result.url,files:[await registerFile(ctx.app,path,projectKey(ctx),result.mediaType)]};}});
 for(const category of ['news','images'] as const)registry.register({name:category==='news'?'web_search_news':'web_search_images',capability:'web-search',description:`Search the configured SearXNG ${category} category and return real result URLs. Requires explicitly selected SearXNG; other providers return an unsupported-provider error.`,input:z.object({query:z.string().min(1).max(500),limit:z.number().int().min(1).max(10).default(5)}).strict(),handler:async(args,ctx)=>{
  const settings:any=ctx.app.store.get('settings','main')??{};if(settings.searchProvider!=='searxng')throw new ToolError('SEARCH_CATEGORY_UNSUPPORTED','This category requires SearXNG selected in search settings');
  const url=new URL('/search',settings.searchUrl||'http://127.0.0.1:8081');if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new ToolError('SEARCH_CONFIGURATION','Configure an HTTP(S) SearXNG endpoint without URL credentials');url.search=new URLSearchParams({q:args.query,categories:category,format:'json',safesearch:String(settings.safeSearch??1),language:settings.searchLanguage??'en'}).toString();
  const response=await fetch(url,{signal:AbortSignal.any([ctx.signal,AbortSignal.timeout(20000)]),redirect:'error'});if(!response.ok)throw new ToolError('SEARCH_UNAVAILABLE',`SearXNG returned HTTP ${response.status}`);
  const reader=response.body?.getReader();if(!reader)throw new ToolError('SEARCH_RESPONSE_INVALID','Search response has no body');let size=0;const chunks:Uint8Array[]=[];try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>2*1024*1024)throw new ToolError('SEARCH_RESPONSE_TOO_LARGE','Search response exceeds 2 MiB');chunks.push(item.value);}}finally{await reader.cancel();}
  let body:any;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ToolError('SEARCH_RESPONSE_INVALID','SearXNG did not return JSON');}if(!Array.isArray(body.results))throw new ToolError('SEARCH_RESPONSE_INVALID','Search response is missing results');
  const httpUrl=(value:any)=>{try{const parsed=new URL(value);return ['http:','https:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password?parsed.href:null;}catch{return null;}};
  return {query:args.query,category,provider:url.origin,results:body.results.flatMap((item:any)=>{const source=httpUrl(item.url),image=httpUrl(item.img_src);if(!source||category==='images'&&!image)return [];return [{url:source,title:String(item.title??'').slice(0,500),excerpt:String(item.content??'').slice(0,2000),...(category==='images'?{image_url:image,thumbnail_url:httpUrl(item.thumbnail_src)}:{published_at:item.publishedDate??null})}];}).slice(0,args.limit),engine_warnings:body.unresponsive_engines??[]};
 }});
 registry.register({name:'web_crawl',capability:'web-fetch',description:'Read up to 30 linked pages on the starting URL origin with a 60-second overall deadline and bounded link queue. Every request uses public-network validation. Returns text and per-page failures; does not bypass access controls.',input:z.object({url:z.string().url(),max_pages:z.number().int().min(1).max(30).default(5),max_chars:z.number().int().min(500).max(6000).default(3000)}).strict(),handler:async(args,ctx)=>{
  const origin=new URL(args.url).origin,queue=[args.url],seen=new Set<string>(),pages:any[]=[],failures:any[]=[];
  const signal=AbortSignal.any([ctx.signal,AbortSignal.timeout(60000)]);
  while(queue.length&&seen.size<args.max_pages){signal.throwIfAborted();const url=queue.shift()!;if(seen.has(url))continue;seen.add(url);
   try{const page=await fetchPage(url,args.max_chars,signal,async target=>{if(target.origin!==origin)throw new ToolError('CRAWL_ORIGIN_CHANGED','Crawl redirects must remain on the starting origin');return ()=>{};},true);
    if(page.bytes){failures.push({url,reason:'PDF requires document extraction'});continue;}
    pages.push({url:page.url,title:page.title,text:page.text,truncated:page.truncated});
    for(const link of page.links??[]){const next=new URL(link.url);next.hash='';if(next.origin===origin&&!seen.has(next.href)&&!queue.includes(next.href)&&queue.length<100)queue.push(next.href);}
   }catch(error){if(signal.aborted)throw error;failures.push({url,reason:(error as Error).message.slice(0,300)});}
  }return {pages,failures,attempted:seen.size,remaining_links:queue.length};
 }});
 registry.register({name:'network_dns_lookup',capability:'web-fetch',description:'Resolve a public hostname to public IP addresses. Rejects private, loopback, reserved, and mixed public/private DNS answers.',input:z.object({hostname:z.string().min(1).max(253)}).strict(),handler:async(args,ctx)=>{ctx.signal.throwIfAborted();return {hostname:args.hostname,addresses:await publicHost(args.hostname)};}});
 registry.register({name:'network_port_check',capability:'web-fetch',description:'Attempt one TCP connection to a public host on port 80 or 443 with a five-second deadline. This is a reachability check, not an ICMP ping or port scan.',input:z.object({hostname:z.string().min(1).max(253),port:z.union([z.literal(80),z.literal(443)]).default(443)}).strict(),handler:async(args,ctx)=>{
  const addresses=await publicHost(args.hostname);ctx.signal.throwIfAborted();const started=Date.now();
  return await new Promise(resolve=>{const socket=connect({host:addresses[0].address,port:args.port,family:addresses[0].family});let done=false;const finish=(reachable:boolean,reason?:string)=>{if(done)return;done=true;ctx.signal.removeEventListener('abort',abort);socket.destroy();resolve({hostname:args.hostname,address:addresses[0].address,port:args.port,reachable,duration_ms:Date.now()-started,...(reason?{reason}:{})});};const abort=()=>finish(false,'Cancelled');ctx.signal.addEventListener('abort',abort,{once:true});socket.setTimeout(5000,()=>finish(false,'Timed out'));socket.once('connect',()=>finish(true));socket.once('error',error=>finish(false,(error as NodeJS.ErrnoException).code??'Connection failed'));if(ctx.signal.aborted)abort();});
 }});
}
