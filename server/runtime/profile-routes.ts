import {saveMemory} from '../storage/memory.ts';
import {randomBytes} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import type {AppContext} from '../app.ts';

export function registerProfileRoutes(app:FastifyInstance,context:AppContext){
 const profiles=context.ephemeral.get('profiles');
 app.get('/api/profiles/status',async(request,reply)=>{let status=profiles.status(profiles.tokenFrom(request));if(process.env.OPENCLAUDE_DESKTOP_OWNED==='1'&&!status.authenticated&&status.activeProfile?.passwordRequired===false){const login=profiles.login(status.activeProfile.loginId,'');if(login.authenticated){reply.header('Set-Cookie',profiles.setCookie(login.token)).header('Cache-Control','no-store');status=profiles.status(login.token);}}if(status.authenticated){const settings=context.store.get('settings','main');if(settings&&!settings.userName)context.store.put('settings',{...settings,userName:status.profile.name});if(!context.store.get('onboarding','main')){context.store.put('onboarding',{id:'main',step:2});saveMemory(context.store,'My name is '+status.profile.name,undefined,'onboarding','profile-name');}}return {desktopSupported:process.env.OPENCLAUDE_DESKTOP_OWNED==='1',...status};});
 app.post('/api/profiles/create',async(request:any,reply)=>{
  const sessionToken=randomBytes(32).toString('hex');
  const result=profiles.create(request.body,sessionToken);
  if(result.authenticated){const settings=context.store.get('settings','main');if(settings)context.store.put('settings',{...settings,userName:result.profile.name});saveMemory(context.store,'My name is '+result.profile.name,undefined,'onboarding','profile-name');context.store.put('onboarding',{...context.store.get('onboarding','main'),id:'main',step:2});}
  if(result.sessionToken)reply.header('Set-Cookie',profiles.setCookie(result.sessionToken)).header('Cache-Control','no-store');
  return {profile:result.profile,restartRequired:result.restartRequired,authenticated:result.authenticated};
 });
 app.post('/api/profiles/login',async(request:any,reply)=>{
  const result=profiles.login(request.body?.loginId,request.body?.password);
  if(result.authenticated){const settings=context.store.get('settings','main');if(settings)context.store.put('settings',{...settings,userName:result.profile.name});reply.header('Set-Cookie',profiles.setCookie(result.token)).header('Cache-Control','no-store');}
  return {authenticated:result.authenticated,selectRequired:result.selectRequired??false,profile:result.profile??null};
 });
 app.post('/api/profiles/select',async(request:any,reply)=>{const token=randomBytes(32).toString('hex');const result=profiles.select(request.body?.loginId,request.body?.password,token);if(result.selected&&result.restartRequired)reply.header('Set-Cookie',profiles.setCookie(token)).header('Cache-Control','no-store');return result;});
 app.delete('/api/profiles/session',async(request:any,reply)=>{profiles.logout(profiles.tokenFrom(request));return reply.header('Set-Cookie',profiles.clearCookie()).header('Cache-Control','no-store').send({authenticated:false});});
}
