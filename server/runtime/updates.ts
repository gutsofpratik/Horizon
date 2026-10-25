import {verify,createPublicKey,createHash,randomUUID} from 'node:crypto';
import {readFile,mkdir,open,rename,unlink,lstat,realpath} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {join,dirname} from 'node:path';
import {z} from 'zod';
import type {AppContext} from '../app.ts';
import type {FastifyInstance} from 'fastify';
const asset=z.object({platform:z.enum(['win32','darwin','linux']),arch:z.enum(['x64','arm64']),url:z.string().url(),sha256:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().positive().max(4*1024**3),kind:z.enum(['installer','portable'])}).strict();
const manifest=z.object({schemaVersion:z.literal(1),version:z.string().regex(/^\d+\.\d+\.\d+$/),contractVersion:z.literal(1),publishedAt:z.string().datetime(),expiresAt:z.string().datetime(),notes:z.string().max(20000),assets:z.array(asset).max(30)}).strict();
const allowedHost=(host:string)=>['github.com','objects.githubusercontent.com','release-assets.githubusercontent.com'].includes(host);
function address(value:string){const url=new URL(value);if(url.protocol!=='https:'||!allowedHost(url.hostname)||url.username||url.password||url.port&&url.port!=='443')throw new Error('Use an official GitHub HTTPS release URL');return url.href;}
async function response(url:string){for(let redirects=0;redirects<6;redirects++){const result=await fetch(address(url),{redirect:'manual',signal:AbortSignal.timeout(120000)});if([301,302,303,307,308].includes(result.status)){const location=result.headers.get('location');await result.body?.cancel();if(!location)throw new Error('Invalid release redirect');url=new URL(location,url).href;continue;}if(!result.ok)throw new Error('Release download failed: HTTP '+result.status);return result;}throw new Error('Too many release redirects');}
export class Updates {
 private cached?:z.infer<typeof manifest>;private busy=false;private checking=false; private release:any=null; private lastError:string|null=null; private checkedAt:string|null=null;
 constructor(private app:AppContext){}
 preferences(){return {automaticCheck:true,automaticDownload:false,automaticInstall:false,...this.app.store.get('update_preferences','main')};}
 configure(patch:{automaticCheck?:boolean;automaticDownload?:boolean;automaticInstall?:boolean}){if(patch.automaticInstall){patch.automaticDownload=true;patch.automaticCheck=true;}if(patch.automaticDownload===false)patch.automaticInstall=false;return this.app.store.put('update_preferences',{...this.preferences(),...patch,id:'main'});}
 async prepareInstall(){
  if(!this.preferences().automaticInstall)return {pending:false};
  if(process.platform!=='win32')throw new Error('Automatic installation currently supports Windows');
  // Verify persisted signed metadata locally; quitting must not wait on GitHub.
  const trust=await this.trust(),envelope=this.app.store.get('update_metadata','main');
  if(!trust||!envelope)return {pending:false};
  const payload=Buffer.from(envelope.payload,'base64');
  if(!verify(null,payload,trust.key,Buffer.from(envelope.signature,'base64')))throw new Error('Stored update signature is invalid');
  const parsed=manifest.parse(JSON.parse(payload.toString('utf8')));
  if(Date.parse(parsed.expiresAt)<=Date.now())return {pending:false};
  const current=String(JSON.parse(await readFile(join(this.app.root,'package.json'),'utf8')).version).split('.').map(Number),next=parsed.version.split('.').map(Number);
  const different=next.findIndex((n,i)=>n!==current[i]);
  if(different<0||next[different]<current[different])return {pending:false};
  this.cached=parsed;
  if(!this.cached)return {pending:false};
  const staged=this.app.store.list('staged_updates').find((record:any)=>record.status==='verified_download'&&record.version===this.cached!.version&&this.cached!.assets.some(asset=>asset.kind==='installer'&&asset.platform===process.platform&&asset.arch===process.arch&&asset.sha256===record.asset?.sha256&&asset.bytes===record.asset?.bytes));
  if(!staged)return {pending:false};
  const info=await lstat(staged.path);
  const directory=await realpath(join(this.app.dataDirectory,'updates')),path=await realpath(staged.path);
  if(info.isSymbolicLink()||!info.isFile()||dirname(path)!==directory||info.size!==staged.asset.bytes)throw new Error('Staged update is outside its verified download directory');
  const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);
  if(hash.digest('hex')!==staged.asset.sha256)throw new Error('Staged update was modified; download it again');
  return {pending:true,path,sha256:staged.asset.sha256,version:staged.version};
 }
 async checkRelease(){
  if(this.checking)return this.status();
  this.checking=true;this.lastError=null;
  try{
   const response=await fetch('https://api.github.com/repos/gutsofpratik/Horizon/releases/latest',{headers:{Accept:'application/vnd.github+json','User-Agent':'Horizon-Updater'},signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw new Error('GitHub update check failed: HTTP '+response.status);
   const body=await response.json() as any;
   const version=String(body.tag_name??'').replace(/^v/,'');
   if(!/^\d+\.\d+\.\d+$/.test(version)||body.draft||body.prerelease)throw new Error('GitHub returned an invalid stable release');
   const pkg=JSON.parse(await readFile(join(this.app.root,'package.json'),'utf8'));
   const a=version.split('.').map(Number),b=String(pkg.version).split('.').map(Number),index=a.findIndex((n,i)=>n!==b[i]);
   this.release={version,url:'https://github.com/gutsofpratik/Horizon/releases/tag/'+encodeURIComponent(body.tag_name),newer:index>=0&&a[index]>b[index],publishedAt:body.published_at};
   if(this.release.newer&&await this.trust()){
    await this.check();
    if(this.preferences().automaticDownload&&this.cached){
     const existing=this.app.store.list('staged_updates').some((item:any)=>item.version===this.cached!.version&&item.status==='verified_download');
     const index=this.cached.assets.findIndex(item=>item.platform===process.platform&&item.arch===process.arch&&item.kind==='installer');
     if(!existing&&index>=0)await this.stage(index);
    }
   }
   this.checkedAt=new Date().toISOString();
  }catch(error){this.lastError=(error as Error).message;throw error;}finally{this.checking=false;}
  return this.status();
 }
 private async trust(){let input:any;try{input=JSON.parse(await readFile(join(this.app.root,'runtime/update-trust.json'),'utf8'));}catch{return null;}if(!input.publicKey||!input.endpoint)return null;const key=createPublicKey(input.publicKey);if(key.asymmetricKeyType!=='ed25519')throw new Error('Update trust requires an Ed25519 public key');return {key,endpoint:address(input.endpoint)};}
 async status(){return {currentVersion:JSON.parse(await readFile(join(this.app.root,'package.json'),'utf8')).version,release:this.release,checkedAt:this.checkedAt,error:this.lastError,checking:this.checking,preferences:this.preferences(),downloading:this.busy,staged:this.app.store.list('staged_updates').filter((item:any)=>item.status==='verified_download').map((item:any)=>({version:item.version,createdAt:item.createdAt})),configured:!!await this.trust(),platform:process.platform,arch:process.arch,available:this.cached??null,automaticInstall:process.platform==='win32'&&!!await this.trust(),reason:'Signed metadata and checksummed staging are separate from OS publisher signing. Verified Windows updates install after the desktop app fully exits.'};}
 async check(){const trust=await this.trust();if(!trust)throw new Error('Public update signing is not configured. Add a publisher-controlled public key and signed-metadata endpoint to the build trust manifest.');const res=await response(trust.endpoint);const chunks:Uint8Array[]=[];let length=0;for await(const bytes of res.body as any){length+=bytes.length;if(length>262144)throw new Error('Update metadata is too large');chunks.push(bytes);}const envelope=z.object({payload:z.string().max(240000),signature:z.string().max(200)}).strict().parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));const payload=Buffer.from(envelope.payload,'base64');if(!verify(null,payload,trust.key,Buffer.from(envelope.signature,'base64')))throw new Error('Update signature is invalid');const parsed=manifest.parse(JSON.parse(payload.toString('utf8')));if(Date.parse(parsed.expiresAt)<=Date.now()||Date.parse(parsed.publishedAt)>Date.now()+300000)throw new Error('Update metadata is expired or dated in the future');const pkg=JSON.parse(await readFile(join(this.app.root,'package.json'),'utf8'));const current=String(pkg.version).split('.').map(Number),next=parsed.version.split('.').map(Number);const different=next.findIndex((n,i)=>n!==current[i]);if(different<0||next[different]<current[different]){this.cached=undefined;return {upToDate:true,version:pkg.version};}this.app.store.put('update_metadata',{id:'main',...envelope});this.cached=parsed;return {available:parsed,platform:process.platform,arch:process.arch};}
 async stage(index:number){if(this.busy)throw new Error('An update download is already running');if(!this.cached||Date.parse(this.cached.expiresAt)<=Date.now())throw new Error('Check signed update metadata first');const item=this.cached.assets[index];if(!item||item.platform!==process.platform||item.arch!==process.arch)throw new Error('Choose a release asset for this exact platform and architecture');this.busy=true;const directory=join(this.app.dataDirectory,'updates'),id=randomUUID(),part=join(directory,id+'.partial'),target=join(directory,id+(item.platform==='win32'&&item.kind==='installer'?'.exe':'.package'));let file;try{await mkdir(directory,{recursive:true});file=await open(part,'wx',0o600);const res=await response(item.url),hash=createHash('sha256');let bytes=0;if(!res.body)throw new Error('Release response has no body');for await(const chunk of res.body as any){bytes+=chunk.length;if(bytes>item.bytes)throw new Error('Release exceeds its signed size');hash.update(chunk);await file.write(chunk);}if(bytes!==item.bytes||hash.digest('hex')!==item.sha256)throw new Error('Release checksum or size does not match signed metadata');await file.close();file=undefined;await rename(part,target);return this.app.store.put('staged_updates',{id,version:this.cached.version,asset:item,status:'verified_download',path:target,createdAt:new Date().toISOString(),requiresExplicitInstaller:true});}finally{await file?.close().catch(()=>{});await unlink(part).catch(()=>{});this.busy=false;}}
}
export function registerUpdates(app:FastifyInstance,context:AppContext){const updates=new Updates(context);context.ephemeral.set('updates',updates);app.get('/api/updates',()=>updates.status());app.post('/api/updates/prepare-install',()=>updates.prepareInstall());app.post('/api/updates/check',()=>updates.checkRelease());app.patch('/api/updates/preferences',request=>{const prefs=updates.configure(z.object({automaticCheck:z.boolean().optional(),automaticDownload:z.boolean().optional(),automaticInstall:z.boolean().optional()}).strict().parse(request.body));if(prefs.automaticCheck)void updates.checkRelease().catch(error=>app.log.warn({err:error},'Update check unavailable'));return prefs;});let timer:ReturnType<typeof setInterval>|undefined;let initial:ReturnType<typeof setTimeout>|undefined;app.addHook('onReady',async()=>{const run=()=>{if(updates.preferences().automaticCheck)void updates.checkRelease().catch(error=>app.log.warn({err:error},'Update check unavailable'));};initial=setTimeout(run,30000);initial.unref();timer=setInterval(run,6*60*60*1000);timer.unref();});app.addHook('onClose',async()=>{clearTimeout(initial);clearInterval(timer);});app.post('/api/updates/stage',(request)=>updates.stage(z.object({asset:z.number().int().nonnegative()}).strict().parse(request.body).asset));}
