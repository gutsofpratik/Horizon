import {createServer,request as httpRequest,type Server,type IncomingMessage} from 'node:http';
import {connect,type Socket} from 'node:net';
import {lookup} from 'node:dns/promises';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {publicAddress} from '../search/provider.ts';

/** Resolve and pin the actual socket destination, rather than trusting a preflight DNS check. */
export class BrowserEgress {
 private server?:Server;private sockets=new Set<Socket>();private password=randomBytes(32).toString('hex');
 private authorized(request:IncomingMessage){const expected='Basic '+Buffer.from('openclaude:'+this.password).toString('base64'),supplied=String(request.headers['proxy-authorization']??'');return Buffer.byteLength(supplied)===Buffer.byteLength(expected)&&timingSafeEqual(Buffer.from(supplied),Buffer.from(expected));}
 private async destination(host:string,port:number){if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('Invalid browser proxy port');const addresses=await lookup(host.replace(/^\[|\]$/g,''),{all:true});if(!addresses.length||addresses.some(item=>!publicAddress(item.address)))throw new Error('Private network targets are blocked');return addresses[0];}
 async start(){if(this.server)throw new Error('Browser proxy already started');const server=createServer(async(request,response)=>{
  if(!this.authorized(request)){response.writeHead(407,{'Proxy-Authenticate':'Basic realm="Horizon browser"'});response.end();return;}
  try{const url=new URL(request.url??'');if(url.protocol!=='http:'||url.username||url.password)throw new Error('Invalid proxy URL');const destination=await this.destination(url.hostname,Number(url.port||80));const headers:Record<string,string|string[]|undefined>={...request.headers,host:url.host};delete headers['proxy-authorization'];delete headers['proxy-connection'];
   const upstream=httpRequest({hostname:destination.address,family:destination.family,port:Number(url.port||80),method:request.method,path:url.pathname+url.search,headers,timeout:30000},remote=>{response.writeHead(remote.statusCode??502,remote.headers);remote.pipe(response);});upstream.on('timeout',()=>upstream.destroy());upstream.on('error',()=>{if(!response.headersSent)response.writeHead(502);response.end();});request.on('aborted',()=>upstream.destroy());response.on('close',()=>upstream.destroy());request.pipe(upstream);
  }catch{response.writeHead(403);response.end('Browser network target is not permitted');}
 });
 server.on('connection',socket=>{this.sockets.add(socket);socket.once('close',()=>this.sockets.delete(socket));socket.setTimeout(120000,()=>socket.destroy());});
 server.on('connect',(request,client,head)=>{void(async()=>{if(!this.authorized(request)){client.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Horizon browser"\r\n\r\n');return;}const url=new URL('https://'+request.url);if(url.username||url.password||url.pathname!=='/')throw new Error('Invalid tunnel');const target=await this.destination(url.hostname,Number(url.port||443));const upstream=connect({host:target.address,port:Number(url.port||443),family:target.family});this.sockets.add(upstream);upstream.once('close',()=>this.sockets.delete(upstream));upstream.setTimeout(120000,()=>upstream.destroy());upstream.once('connect',()=>{client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);client.pipe(upstream);upstream.pipe(client);});upstream.on('error',()=>client.destroy());client.on('error',()=>upstream.destroy());client.on('close',()=>upstream.destroy());upstream.on('close',()=>client.destroy());})().catch(()=>client.end('HTTP/1.1 403 Forbidden\r\n\r\n'));});
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve());});this.server=server;const address=server.address();if(!address||typeof address==='string')throw new Error('Cannot allocate browser egress proxy');return {server:'http://127.0.0.1:'+address.port,username:'openclaude',password:this.password};
 }
 async close(){for(const socket of this.sockets)socket.destroy();if(this.server)await new Promise<void>(resolve=>this.server!.close(()=>resolve()));this.server=undefined;}
}
