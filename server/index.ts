import {resolve} from 'node:path';
import {existsSync,mkdirSync} from 'node:fs';
import staticFiles from '@fastify/static';
import {createApp} from './app.ts';
const app=await createApp({dataDirectory:resolve(process.env.OPENCLAUDE_DATA_DIR??'.local'),root:process.cwd()});
if(existsSync(resolve('dist/index.html'))){await app.register(staticFiles,{root:resolve('dist')});mkdirSync(resolve('dist-desktop'),{recursive:true});await app.register(staticFiles,{root:resolve('dist-desktop'),prefix:'/desktop/',decorateReply:false});app.setNotFoundHandler((request,reply)=>request.url.startsWith('/api/')?reply.code(404).send({error:'Not found'}):reply.sendFile('index.html',(request.url.startsWith('/desktop/')||request.headers['user-agent']?.includes('OpenClaudeDesktop'))?resolve('dist-desktop'):resolve('dist')));}
await app.listen({port:Number(process.env.PORT??3001),host:'127.0.0.1'});
console.log(`OpenClaude API: http://127.0.0.1:${process.env.PORT??3001}`);
