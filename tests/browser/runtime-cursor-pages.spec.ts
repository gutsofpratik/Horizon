import {test,expect} from './test-fixture';

test('history opens a bounded page and loads older messages without losing the active head',async({page})=>{
 const messages=Array.from({length:120},(_,index)=>({id:'m'+index,parentId:index?'m'+(index-1):null,role:index%2?'assistant':'user',status:'completed',content:'History entry '+index}));
 const conversation={id:'paged-fixture',title:'Paged history',headId:'m119',messages,model:'fixture',providerId:'fixture'};
 const requested:string[]=[];
 await page.route('**/api/**',route=>{
  const url=new URL(route.request().url()),path=url.pathname;let result:any=[];if(path==='/api/session')return route.fulfill({json:{authenticated:true}});if(path==='/api/onboarding')return route.fulfill({json:{completed:true}});if(path==='/api/workspace/attention')return route.fulfill({json:{approvals:[],questions:[],plans:[]}});if(path==='/api/profiles/status')return route.fulfill({json:{authenticated:true,profiles:[]}});
  if(path==='/api/entities/settings')result=[{id:'main',model:'fixture',providerId:'fixture'}];
  else if(path==='/api/entities/conversations')result=[{...conversation,messages:undefined,updatedAt:'2026-10-19T00:00:00Z'}];
  else if(path==='/api/entities/providers')result=[{id:'fixture',name:'Fixture',type:'openai'}];
  else if(path==='/api/models')result={models:[{id:'fixture',name:'Fixture model',providerId:'fixture',capabilities:[]}]};
  else if(path==='/api/conversations/paged-fixture/messages'){
   requested.push(url.search);const end=Number(url.searchParams.get('before')??messages.length),start=Math.max(0,end-50);
   result={conversation:{...conversation,messages:undefined},messages:messages.slice(start,end),siblings:[],pagination:{limit:50,total:120,storedTotal:120,before:String(start),after:String(end-1),hasMoreBefore:start>0,hasMoreAfter:end<120}};
  }else if(path==='/api/artifact-drafts')result={drafts:[]};
  else if(path.endsWith('/queue'))result={messages:[]};
  else if(path.endsWith('/messages')&&route.request().method()==='GET')result={messages:[]};
  return route.fulfill({json:result});
 });
 await page.goto('/chat/paged-fixture',{waitUntil:'domcontentloaded'});
 await expect(page.getByText('History entry 119',{exact:true})).toBeVisible();
 await expect(page.getByText('History entry 0',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('feed')).toContainText('History entry 70');
 await page.getByRole('button',{name:'Load earlier messages',exact:true}).click();
 await expect(page.getByRole('feed')).toContainText('History entry 20');
 await expect(page.getByText('History entry 119',{exact:true})).toHaveCount(1);
 await page.getByRole('button',{name:'Load earlier messages',exact:true}).click();
 await expect(page.getByRole('feed')).toContainText('History entry 0');
 await expect(page.getByRole('button',{name:'Load earlier messages',exact:true})).toHaveCount(0);
 expect(requested).toEqual(['','?before=70','?before=20']);
});
