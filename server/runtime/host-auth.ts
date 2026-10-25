import {randomBytes,timingSafeEqual,createHmac} from 'node:crypto';
import {readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import type {FastifyInstance} from 'fastify';
import type {AppContext} from '../app.ts';

const equal=(a:string,b:string)=>Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export class HostAccess {
 readonly credentialFile:string;private secret:string;
 constructor(directory:string){this.credentialFile=join(directory,'host-access.json');let secret=process.env.OPENCLAUDE_HOST_TOKEN;if(!secret){try{secret=JSON.parse(readFileSync(this.credentialFile,'utf8')).token;}catch(error){if((error as any).code!=='ENOENT')throw new Error('Host credential file could not be read; repair it instead of bypassing authentication');secret=randomBytes(32).toString('hex');writeFileSync(this.credentialFile,JSON.stringify({version:1,token:secret}),{flag:'wx',mode:0o600});}if(process.platform!=='win32')chmodSync(this.credentialFile,0o600);}if(typeof secret!=='string'||!/^[a-f0-9]{64}$/.test(secret))throw new Error('Horizon host token must contain 64 hexadecimal characters');this.secret=secret;}
 private sign(value:string){return createHmac('sha256',this.secret).update(value).digest('hex');}
 inferenceToken(){return this.sign('OpenClaude:inference:v1');}
 acceptsInference(request:any){const token=String(request.headers.authorization??'').match(/^Bearer ([a-f0-9]{64})$/)?.[1];return !!token&&equal(token,this.inferenceToken());}
 acceptsToken(value:string){return typeof value==='string'&&equal(value,this.secret);}
 authenticated(request:any){
  const bearer=String(request.headers.authorization??'').match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if(bearer&&this.acceptsToken(bearer))return true;
  const site=request.headers['sec-fetch-site'];
  if(site&&site!=='same-origin'&&site!=='none')return false;
  const cookie=String(request.headers.cookie??'').split(';').map((item:string)=>item.trim()).find((item:string)=>item.startsWith('OpenClaudeSession='))?.slice('OpenClaudeSession='.length);
  if(!cookie||cookie.length>256)return false;
  const parts=cookie.split('.');if(parts.length!==3)return false;
  const [expiry,nonce,signature]=parts;
  return /^\d+$/.test(expiry)&&/^[a-f0-9]{32}$/.test(nonce)&&Number(expiry)>Date.now()&&Number(expiry)<Date.now()+31*86400000&&equal(signature,this.sign(expiry+'.'+nonce));
 }
 cookie(){const value=String(Date.now()+30*86400000)+'.'+randomBytes(16).toString('hex');return 'OpenClaudeSession='+value+'.'+this.sign(value)+'; Path=/api; HttpOnly; SameSite=Strict; Max-Age=2592000';}
}
export function registerHostAccess(app:FastifyInstance,context:AppContext){const access=new HostAccess(context.dataDirectory);context.ephemeral.set('hostAccess',access);
 app.get('/api/session',async(request)=>({authenticated:access.authenticated(request),requiresToken:true,desktopManaged:process.env.OPENCLAUDE_DESKTOP_OWNED==='1'}));
 app.post('/api/session',async(request:any,reply)=>{const token=request.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!token||!access.acceptsToken(token))return reply.code(401).send({error:'A valid Horizon host access token is required'});return reply.header('Set-Cookie',access.cookie()).header('Cache-Control','no-store').send({authenticated:true});});
 app.delete('/api/session',async(_request,reply)=>reply.header('Set-Cookie','OpenClaudeSession=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0').send({authenticated:false}));
 return access;
}
