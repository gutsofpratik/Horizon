import {randomBytes,randomUUID,scryptSync,timingSafeEqual} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,renameSync,unlinkSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';

const AVATARS=new Set(['spark','planet','leaf','bolt','flower','moon','sun','orbit']);
type ProfileRecord={id:string;name:string;loginId:string;avatar:string;salt:string;passwordHash:string;legacyData:boolean;createdAt:string};
type RegistryFile={version:1;activeProfileId:string|null;profiles:ProfileRecord[]};
const publicProfile=({id,name,loginId,avatar}:ProfileRecord)=>({id,name,loginId,avatar});

/** Local desktop profile accounts. Secrets stay in the registry; user data lives in one DB directory per profile. */
export class ProfileRegistry{
 private sessions=new Map<string,string>();
 private failures=new Map<string,{count:number;blockedUntil:number}>();
 private file:RegistryFile;
 constructor(readonly registryFile:string,readonly profilesRoot:string,readonly legacyDataDirectory:string){
  mkdirSync(dirname(registryFile),{recursive:true});
  if(existsSync(registryFile)){
   try{const value=JSON.parse(readFileSync(registryFile,'utf8'));if(value?.version!==1||!Array.isArray(value.profiles)||!(value.activeProfileId===null||typeof value.activeProfileId==='string')||!value.profiles.every((profile:any)=>profile&&/^[0-9a-f-]{36}$/i.test(profile.id)&&/^[a-z0-9][a-z0-9._-]{2,31}$/.test(profile.loginId)&&typeof profile.name==='string'&&typeof profile.avatar==='string'&&AVATARS.has(profile.avatar)&&/^[a-f0-9]{32}$/.test(profile.salt)&&/^[a-f0-9]{128}$/.test(profile.passwordHash)&&typeof profile.legacyData==='boolean'&&typeof profile.createdAt==='string')||value.activeProfileId&&!value.profiles.some((profile:any)=>profile.id===value.activeProfileId))throw new Error();this.file=value;}
   catch{throw new Error('Horizon profile registry is invalid. The file was preserved; repair or restore it before continuing.');}
  }else this.file={version:1,activeProfileId:null,profiles:[]};
 }
 private persist(){
  mkdirSync(dirname(this.registryFile),{recursive:true});
  const temporary=this.registryFile+'.'+randomBytes(6).toString('hex')+'.tmp';
  writeFileSync(temporary,JSON.stringify(this.file,null,2),{mode:0o600});
  try{renameSync(temporary,this.registryFile);}catch(error){try{unlinkSync(temporary);}catch{}throw error;}
 }
 private password(value:string,salt:string){return scryptSync(value,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024}).toString('hex');}
 private validProfileInput(input:any){
  const name=typeof input?.name==='string'?input.name.trim():'';
  const loginId=typeof input?.loginId==='string'?input.loginId.trim().toLowerCase():'';
  const password=typeof input?.password==='string'?input.password:'';
  const avatar=typeof input?.avatar==='string'&&AVATARS.has(input.avatar)?input.avatar:'spark';
  if(name.length<1||name.length>80)throw new Error('Enter a profile name between 1 and 80 characters');
  if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(loginId))throw new Error('Login ID must be 3–32 characters using letters, numbers, dots, underscores, or hyphens');
  if(password.length<8||password.length>1024)throw new Error('Password must be at least 8 characters');
  return {name,loginId,password,avatar};
 }
 create(input:any,sessionToken?:string){
  const value=this.validProfileInput(input);
  if(this.file.profiles.some(profile=>profile.loginId===value.loginId))throw new Error('That login ID is already in use on this device');
  const first=this.file.profiles.length===0;
  const salt=randomBytes(16).toString('hex');
  const profile:ProfileRecord={id:randomUUID(),name:value.name,loginId:value.loginId,avatar:value.avatar,salt,passwordHash:this.password(value.password,salt),legacyData:first,createdAt:new Date().toISOString()};
  this.file.profiles.push(profile);
  if(first)this.file.activeProfileId=profile.id;
  if(!first)mkdirSync(this.dataDirectory(profile.id),{recursive:true});
  this.persist();
  if(first&&sessionToken)this.sessions.set(sessionToken,profile.id);
  return {profile:publicProfile(profile),restartRequired:false,authenticated:first,sessionToken:first?sessionToken:undefined};
 }
 authenticate(loginId:string,password:string){
  const normalized=String(loginId??'').trim().toLowerCase();
  const failure=this.failures.get(normalized);if(failure&&failure.blockedUntil>Date.now())return undefined;
  if(typeof password!=='string'||password.length>1024)return undefined;
  const profile=this.file.profiles.find(item=>item.loginId===normalized);
  if(!profile){this.recordFailure(normalized);return undefined;}
  const actual=Buffer.from(this.password(password,profile.salt),'hex'),expected=Buffer.from(profile.passwordHash,'hex');
  if(actual.length===expected.length&&timingSafeEqual(actual,expected)){this.failures.delete(normalized);return profile;}
  this.recordFailure(normalized);return undefined;
 }
 private recordFailure(loginId:string){const state=this.failures.get(loginId)??{count:0,blockedUntil:0};state.count++;if(state.count>=5){state.count=0;state.blockedUntil=Date.now()+30000;}this.failures.set(loginId,state);}
 login(loginId:string,password:string){
  const profile=this.authenticate(loginId,password);
  if(!profile)return {authenticated:false};
  if(profile.id!==this.file.activeProfileId)return {authenticated:false,selectRequired:true,profile:publicProfile(profile)};
  const token=randomBytes(32).toString('hex');this.sessions.set(token,profile.id);
  return {authenticated:true,token,profile:publicProfile(profile)};
 }
 select(loginId:string,password:string){
  const profile=this.authenticate(loginId,password);
  if(!profile)return {selected:false};
  const restartRequired=profile.id!==this.file.activeProfileId;
  if(restartRequired){this.file.activeProfileId=profile.id;this.persist();}
  return {selected:true,restartRequired,profile:publicProfile(profile)};
 }
 status(token?:string){
  const active=this.activeProfile();const authenticated=!!token&&this.sessions.get(token)===active?.id;
  return {initialized:this.file.profiles.length>0,authenticated,profile:authenticated&&active?publicProfile(active):null,activeProfile:active?publicProfile(active):null,profiles:this.file.profiles.map(publicProfile)};
 }
 authenticateSession(token?:string){return !!token&&this.sessions.get(token)===this.file.activeProfileId;}
 logout(token?:string){if(token)this.sessions.delete(token);}
 activeProfile(){return this.file.profiles.find(profile=>profile.id===this.file.activeProfileId)??null;}
 dataDirectory(profileId:string){
  const profile=this.file.profiles.find(item=>item.id===profileId);if(!profile)throw new Error('Profile does not exist');
  return profile.legacyData?resolve(this.legacyDataDirectory):join(this.profilesRoot,profile.id,'data');
 }
 get cookieName(){return 'HorizonProfileSession';}
 setCookie(token:string){return `${this.cookieName}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=2592000`;}
 clearCookie(){return `${this.cookieName}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0`;}
 tokenFrom(request:any){return String(request.headers.cookie??'').split(';').map((part:string)=>part.trim()).find((part:string)=>part.startsWith(this.cookieName+'='))?.slice(this.cookieName.length+1);}
}
