import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{
 await page.route('**/api/entities/settings',route=>route.fulfill({json:route.request().method()==='GET'?[{id:'main',providerId:'fixture',model:'fixture-model'}]:route.request().postDataJSON()}));
 await page.route('**/api/entities/providers',route=>route.fulfill({json:[{id:'fixture',name:'Fixture',type:'ollama'}]}));
 await page.route('**/api/models',route=>route.fulfill({json:{models:[{id:'fixture-model',name:'Fixture model',providerId:'fixture',capabilities:[]}]}}));
});


test('artifact stays in the original response while an update continues through tool results',async({page,request})=>{
 const id='artifact-stream-'+crypto.randomUUID(),artifactId=crypto.randomUUID();
 const initial={id,title:'Streaming artifact regression',headId:'a1',messages:[{id:'u1',role:'user',content:'Create a preview',parentId:null},{id:'a1',role:'assistant',content:'Original preview response',parentId:'u1',runId:'create',status:'completed'}]};
 const artifact={id:artifactId,title:'Stable live preview',type:'html',source:'<h1>Version one</h1>',version:1,conversationId:id,creationRunId:'create',versions:[{number:1,source:'<h1>Version one</h1>'}]};
 await request.post('/api/entities/conversations',{data:initial});await request.post('/api/entities/artifacts',{data:artifact});
 await page.route('**/api/runs',route=>route.fulfill({json:{id:'update-live',conversationId:id}}));
 await page.route('**/api/entities/conversations/'+id,route=>route.fulfill({json:{...initial,headId:'u2',messages:[...initial.messages,{id:'u2',role:'user',content:'Improve it',parentId:'a1'}]}}));
 await page.route('**/api/runs/update-live',route=>route.fulfill({json:{status:'running'}}));
 const events=[{type:'message.started',data:{message:{id:'a2',parentId:'u2',role:'assistant',content:'',status:'generating',runId:'update-live'}}},{type:'artifact.created',data:{...artifact,version:2,source:'<h1>Updated preview</h1>',versions:[...artifact.versions,{number:2,source:'<h1>Updated preview</h1>'}]}},{type:'message.completed',data:{message:{id:'a2',parentId:'u2',role:'assistant',content:'',status:'completed',runId:'update-live'}}},{type:'message.appended',data:{message:{id:'tool2',parentId:'a2',role:'tool',content:'{}'}}},{type:'message.started',data:{message:{id:'a3',parentId:'tool2',role:'assistant',content:'Continuing after update',status:'generating',runId:'update-live'}}}];
 await page.route('**/api/runs/update-live/events',route=>route.fulfill({contentType:'text/event-stream',body:events.map(event=>'data: '+JSON.stringify(event)+'\n\n').join('')}));
 try{await page.goto('/chat/'+id);await page.getByRole('textbox',{name:'Message',exact:true}).fill('Improve it');await page.getByRole('button',{name:'Send message',exact:true}).click();await expect(page.getByText('Continuing after update',{exact:true})).toBeVisible();await expect(page.locator('.thinking-shimmer')).toHaveCount(1);await expect(page.locator('.thinking-shimmer')).toHaveCSS('animation-name','thinking-flow');await expect(page.locator('.chat-artifact-card')).toHaveCount(1);await expect(page.locator('.chat-artifact-card')).toContainText('version 2');await expect(page.getByText('Original preview response',{exact:true})).toBeVisible();await expect(page.frameLocator('iframe').getByRole('heading',{name:'Updated preview'})).toBeVisible();}finally{await request.delete('/api/entities/conversations/'+id);await request.delete('/api/entities/artifacts/'+artifactId);}
});

