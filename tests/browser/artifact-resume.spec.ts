import {test,expect} from '@playwright/test';
test('reopening a stopped chat restores checkpoint source without executing the draft',async({page,request})=>{
 const id='resume-ui-'+crypto.randomUUID();
 await request.post('/api/entities/conversations',{data:{id,title:'Stopped artifact',messages:[]}});
 await page.route('**/api/artifact-drafts?conversationId='+id,route=>route.fulfill({json:{drafts:[{id:'checkpoint',title:'Interrupted page',type:'html',source:'<h1>Saved checkpoint</h1>',conversationId:id,status:'cancelled',revision:2}]}}));
 try{await page.goto('/chat/'+id);await expect(page.locator('.artifact-source')).toContainText('Saved checkpoint');await expect(page.locator('.artifact-panel iframe')).toHaveCount(0);}finally{await request.delete('/api/entities/conversations/'+id);}
});
