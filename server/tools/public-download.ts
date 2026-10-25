import http from 'node:http';
import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {publicAddress} from '../search/provider.ts';
import {ToolError} from './registry.ts';
export async function downloadPublic(address:string,signal:AbortSignal){
 let url=new URL(address);const bounded=AbortSignal.any([signal,AbortSignal.timeout(30000)]);
 for(let redirect=0;redirect<=5;redirect++){
  const host=url.hostname.replace(/^\[|\]$/g,'');
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new ToolError('URL_NOT_ALLOWED','Use public HTTP(S) without URL credentials');
  if(host==='localhost'||host.endsWith('.localhost')||isIP(host)&&!publicAddress(host))throw new ToolError('PRIVATE_NETWORK','Only public addresses can be downloaded');
  const response=await new Promise<{status:number;headers:http.IncomingHttpHeaders;body:Buffer}>((resolve,reject)=>{
   const request=(url.protocol==='https:'?https:http).request(url,{signal:bounded,headers:{'User-Agent':'Horizon/0.3','Accept':'*/*','Accept-Encoding':'identity'},lookup:((hostname:string,options:any,callback:any)=>{lookup(hostname,{all:true}).then(addresses=>{if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new ToolError('PRIVATE_NETWORK','Private or mixed network DNS answers are blocked');if(options.all)callback(null,addresses);else callback(null,addresses[0].address,addresses[0].family);}).catch(callback);}) as any},res=>{const chunks:Buffer[]=[];let size=0;if(Number(res.headers['content-length'])>25*1024*1024){request.destroy(new ToolError('DOWNLOAD_TOO_LARGE','Download exceeds 25 MiB'));return;}res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>25*1024*1024)request.destroy(new ToolError('DOWNLOAD_TOO_LARGE','Download exceeds 25 MiB'));else chunks.push(chunk);});res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode??0,headers:res.headers,body:Buffer.concat(chunks)}));});request.on('error',reject);request.end();
  });
  if(response.status>=300&&response.status<400&&response.headers.location){url=new URL(response.headers.location,url);continue;}
  if(response.status<200||response.status>=300)throw new ToolError('DOWNLOAD_FAILED',`Download returned HTTP ${response.status}`);
  return {url:url.href,bytes:response.body,mediaType:String(response.headers['content-type']??'application/octet-stream').split(';')[0].slice(0,200)};
 }throw new ToolError('TOO_MANY_REDIRECTS','Download exceeded five redirects');
}
