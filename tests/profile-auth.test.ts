import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.ts';

test('desktop profile password gates workspace APIs after host authentication',async()=>{
 const root=await mkdtemp(join(tmpdir(),'horizon-profile-auth-'));
 const previous={OPENCLAUDE_DESKTOP_OWNED:process.env.OPENCLAUDE_DESKTOP_OWNED,OPENCLAUDE_HOST_TOKEN:process.env.OPENCLAUDE_HOST_TOKEN,HORIZON_PROFILE_REGISTRY:process.env.HORIZON_PROFILE_REGISTRY,HORIZON_PROFILES_ROOT:process.env.HORIZON_PROFILES_ROOT};
 process.env.OPENCLAUDE_DESKTOP_OWNED='1';process.env.OPENCLAUDE_HOST_TOKEN='a'.repeat(64);process.env.HORIZON_PROFILE_REGISTRY=join(root,'profiles.json');process.env.HORIZON_PROFILES_ROOT=join(root,'profiles');
 let app:any;
 try{
  app=await createApp({dataDirectory:join(root,'legacy-data'),root,desktopServices:server=>{server.get('/api/builtin/profile-test',async()=>({ready:true}));}});
  const headers={authorization:'Bearer '+'a'.repeat(64)};
  const created=await app.inject({method:'POST',url:'/api/profiles/create',headers,payload:{name:'Pratik Soni',loginId:'pratik',password:'horizon-password-1',avatar:'spark'}});
  assert.equal(created.statusCode,200,created.body);
  const cookie=String(created.headers['set-cookie']).split(';')[0];
  assert.match(cookie,/^HorizonProfileSession=/);
  const locked=await app.inject({method:'GET',url:'/api/entities/settings',headers});
  assert.equal(locked.statusCode,401);
  const startup=await app.inject({method:'GET',url:'/api/runtime/startup',headers});
  assert.equal(startup.statusCode,200,'startup can render before profile unlock');
  assert.equal(startup.json().office.binary,undefined,'startup does not expose private runtime paths');
  assert.equal((await app.inject('/api/runtime/startup')).statusCode,401,'startup still requires host authentication');
  assert.equal((await app.inject({method:'POST',url:'/api/onboarding/memories',headers,payload:{text:'Private fact'}})).statusCode,401,'onboarding memory writes still require profile unlock');
  assert.equal((await app.inject('/api/health')).statusCode,200,'native readiness must work while a profile is locked');
  assert.equal((await app.inject({method:'POST',url:'/api/session',headers})).statusCode,200,'host sign-in must precede profile unlock');
  assert.equal((await app.inject({method:'POST',url:'/api/session',headers:{authorization:'Bearer '+'b'.repeat(64)}})).statusCode,401,'host sign-in still requires its own credential');
  const unlocked=await app.inject({method:'GET',url:'/api/entities/settings',headers:{...headers,cookie}});
  assert.equal(unlocked.statusCode,200,unlocked.body);
  const inferenceHeaders={authorization:'Bearer '+app.context.ephemeral.get('hostAccess').inferenceToken()};
  const inference=await app.inject({method:'GET',url:'/api/builtin/profile-test',headers:inferenceHeaders});
  assert.equal(inference.statusCode,200,inference.body);
  const escaped=await app.inject({method:'GET',url:'/api/entities/settings',headers:inferenceHeaders});
  assert.equal(escaped.statusCode,401,'inference credentials must not unlock workspace data');
  const wrong=await app.inject({method:'POST',url:'/api/profiles/login',headers,payload:{loginId:'pratik',password:'wrong-password'}});
  assert.equal(wrong.json().authenticated,false);
 }finally{
  if(app)await app.close();await rm(root,{recursive:true,force:true});
  for(const [key,value] of Object.entries(previous)){if(value===undefined)delete (process.env as any)[key];else (process.env as any)[key]=value;}
 }
});
