import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {startInferenceHeartbeat} from '../server/models/heartbeat.ts';
import {createServer,get} from 'node:http';
test('an idle inference stream stays alive without emitting fabricated model content',async()=>{
 const response:any=new EventEmitter();const writes:string[]=[];response.destroyed=false;response.writableEnded=false;response.write=(text:string)=>writes.push(text);
 const stop=startInferenceHeartbeat(response,5);try{await new Promise(resolve=>setTimeout(resolve,22));assert.ok(writes.length>=1);assert.ok(writes.every(text=>text.startsWith(':')&&text.endsWith('\n\n')));response.emit('close');const count=writes.length;await new Promise(resolve=>setTimeout(resolve,15));assert.equal(writes.length,count);}finally{stop();}
});
test('a real HTTP inference stream survives longer than the client idle timeout',async()=>{
 const server=createServer((_request,response)=>{response.writeHead(200,{'Content-Type':'text/event-stream'});response.flushHeaders();const stop=startInferenceHeartbeat(response,15);const finish=setTimeout(()=>{stop();response.end('data: [DONE]\n\n');},400);response.once('close',()=>clearTimeout(finish));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('No test port');
 try{const body=await new Promise<string>((resolve,reject)=>{const request=get('http://127.0.0.1:'+address.port,response=>{let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve(body));response.on('error',reject);});request.setTimeout(100,()=>request.destroy(new Error('Idle inference stream terminated')));request.on('error',reject);});assert.match(body,/: inference keep-alive/);assert.match(body,/data: \[DONE\]/);}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
