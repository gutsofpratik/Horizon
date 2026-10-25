import {request} from '@playwright/test';
import {join} from 'node:path';
export default async function setup(){
 const client=await request.newContext({baseURL:'http://127.0.0.1:5173'});
 try{
  const response=await client.post('/api/session',{headers:{Authorization:'Bearer '+process.env.HORIZON_BROWSER_TEST_TOKEN}});
  if(!response.ok())throw new Error('Could not authenticate isolated browser test session: '+await response.text());
  const profile=await client.post('/api/profiles/create',{data:{name:'Browser Test',loginId:'browser-test',password:'Temporary-browser-tests-only',avatar:'spark'}});
  if(!profile.ok()||!(await profile.json()).authenticated)throw new Error('Could not create isolated browser test profile');
  await client.storageState({path:join(process.env.HORIZON_BROWSER_TEST_DIRECTORY!,'browser-state.json')});
 }finally{await client.dispose();}
}
