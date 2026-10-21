import {requestEdition} from './runtime/edition.ts';
import {applyPendingRollback} from './storage/migrations.ts';
import {resolve} from 'node:path';
import {existsSync,mkdirSync} from 'node:fs';
import staticFiles from '@fastify/static';
import {createApp,type AppContext} from './app.ts';
import type {FastifyInstance} from 'fastify';
export async function startHost(desktopServices?:(app:FastifyInstance,context:AppContext)=>void){
await applyPendingRollback(resolve(process.env.OPENCLAUDE_DATA_DIR??'.local'));
const app=await createApp({dataDirectory:resolve(process.env.OPENCLAUDE_DATA_DIR??'.local'),root:process.cwd(),desktopServices});
if(existsSync(resolve('dist/index.html'))){await app.register(staticFiles,{root:resolve('dist')});mkdirSync(resolve('dist-desktop'),{recursive:true});await app.register(staticFiles,{root:resolve('dist-desktop'),prefix:'/desktop/',decorateReply:false});app.setNotFoundHandler((request,reply)=>request.url.startsWith('/api/')?reply.code(404).send({error:'Not found'}):reply.sendFile('index.html',(request.url.startsWith('/desktop/')||requestEdition(request)==='desktop')?resolve('dist-desktop'):resolve('dist')));}
app.post('/api/desktop/shutdown',async(_request,reply)=>{if(process.env.OPENCLAUDE_DESKTOP_OWNED!=='1')return reply.code(403).send({error:'This host is not owned by the desktop app'});setTimeout(()=>void app.close().then(()=>process.exit(0)).catch(()=>process.exit(1)),100);return {stopping:true};});
await app.listen({port:Number(process.env.PORT??3001),host:'127.0.0.1'});
void (app as any).context.ephemeral.get('documentRuntime').prepare().catch(()=>{});
if(process.env.OPENCLAUDE_DESKTOP_OWNED!=='1')console.log('Horizon host access token file: '+(app as any).context.ephemeral.get('hostAccess').credentialFile);
console.log(`Horizon API: http://127.0.0.1:${process.env.PORT??3001}`);

let shuttingDown=false;for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{if(shuttingDown)return;shuttingDown=true;void app.close().then(()=>process.exit(0)).catch(()=>process.exit(1));});

return app;
}
