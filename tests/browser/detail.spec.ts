import {test,expect} from './test-fixture';
import JSZip from 'jszip';
test('artifact revisions update the original card and reopen from a preview link',async({page,request})=>{
 const id='ui-revision-'+crypto.randomUUID();let artifactId='';const runId='manual:'+id;
 const messages=[{id:'u',role:'user',content:'Create a page',parentId:null},{id:'a',role:'assistant',content:'Created the page.',parentId:'u',status:'completed',runId}];
 await request.post('/api/entities/conversations',{data:{id,title:'Revision verification',headId:'a',messages}});
 try {const created=await (await request.post('/api/tools/call',{data:{conversationId:id,name:'artifact_create',arguments:{title:'Stable preview',type:'html',source:'<h1>Original</h1>'}}})).json();artifactId=created.data.artifact.id;
 const updated=await (await request.post('/api/tools/call',{data:{conversationId:id,name:'artifact_update',arguments:{artifact_id:artifactId,expected_version:1,source:'<h1>Improved</h1>'}}})).json();expect(updated.data.artifact.id).toBe(artifactId);
 await request.post('/api/entities/conversations',{data:{id,headId:'revision',messages:[...messages,{id:'followup',role:'user',content:'Make it better',parentId:'a'},{id:'revision',role:'assistant',content:'Updated the same page.',parentId:'followup',status:'completed',runId:'later'}]}});
 await page.goto('/chat/'+id+'?artifact='+artifactId);await expect(page.frameLocator('iframe[title="Stable preview"]').getByRole('heading',{name:'Improved'})).toBeVisible();await expect(page.locator('.chat-artifact-card')).toHaveCount(1);await expect(page.locator('.message-turn').filter({has:page.locator('.chat-artifact-card')})).toContainText('Created the page.');await page.getByRole('combobox',{name:'Artifact version'}).selectOption('1');await expect(page.frameLocator('iframe[title="Stable preview"]').getByRole('heading',{name:'Original'})).toBeVisible();
 } finally{if(artifactId)await request.delete('/api/entities/artifacts/'+artifactId);await request.delete('/api/entities/conversations/'+id);}
});
test('plugin ZIP installs real skills and uninstall removes its registered package',async({page,request})=>{
 const name='ui-plugin-'+crypto.randomUUID();const zip=new JSZip();zip.file('.claude-plugin/plugin.json',JSON.stringify({name,version:'1.0',description:'UI import verification'}));zip.file('skills/test/SKILL.md','---\nname: ui-test-skill\ndescription: UI package check\n---\nBe clear.');
 try {await page.goto('/skills');await page.getByRole('tab',{name:'Plugins',exact:true}).click();await page.locator('input[aria-label="Plugin ZIP"]').setInputFiles({name:'plugin.zip',mimeType:'application/zip',buffer:await zip.generateAsync({type:'nodebuffer'})});await expect(page.getByRole('button',{name:'View '+name,exact:true})).toBeVisible();await expect(page.getByRole('status')).toContainText('installed with 1 skill');await page.getByRole('button',{name:'Uninstall '+name,exact:true}).click();await expect(page.getByRole('button',{name:'View '+name,exact:true})).toHaveCount(0);
 } finally {const plugins=await (await request.get('/api/plugins')).json();for(const plugin of plugins.filter((item:any)=>item.name===name))await request.delete('/api/plugins/'+plugin.id);}
});
test('reasoning, branches, rename, and artifact source/preview work in a saved conversation',async({page,request})=>{
 const id='ui-detail-'+crypto.randomUUID();const artifactId='ui-artifact-'+crypto.randomUUID();
 await request.post('/api/entities/conversations',{data:{id,title:'UI detail verification',headId:'a',messages:[{id:'u',role:'user',parentId:null,content:'Build a greeting'},{id:'a',role:'assistant',parentId:'u',content:'Here is your greeting.',reasoning:'I will use a simple heading.',status:'completed'},{id:'b',role:'assistant',parentId:'u',content:'An alternate greeting.',status:'completed'}]}});
 await request.post('/api/entities/artifacts',{data:{id:artifactId,conversationId:id,title:'Greeting preview',type:'html',version:1,source:'<h1>Hello preview</h1>',versions:[{number:1,source:'<h1>Hello preview</h1>'}]}});
 try {
  await page.goto('/chat/'+id);
  await page.getByRole('button',{name:'Thought process'}).click();await expect(page.getByText('I will use a simple heading.')).toBeVisible();
  await page.getByRole('button',{name:'Next branch'}).click();await expect(page.getByText('An alternate greeting.')).toBeVisible();
  await page.getByRole('button',{name:'Conversation options'}).click();await page.getByRole('menuitem',{name:'Rename',exact:true}).click();await page.getByRole('textbox',{name:'Conversation title'}).fill('Renamed verification');await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('button',{name:'Conversation options'})).toContainText('Renamed verification');
  await page.getByRole('button',{name:/Greeting preview.*Click to open/}).click();await expect(page.frameLocator('iframe[title="Greeting preview"]').getByRole('heading',{name:'Hello preview'})).toBeVisible();
  await page.getByRole('complementary',{name:'Artifact preview'}).getByRole('button',{name:'Code',exact:true}).click();await expect(page.locator('.artifact-source code')).toContainText('<h1>Hello preview</h1>');await page.getByRole('button',{name:'Expand preview'}).click();await expect(page.locator('.artifact-panel')).toHaveClass(/panel-wide/);await page.getByRole('button',{name:'Close artifact'}).click();await expect(page.locator('.artifact-panel')).toHaveCount(0);
 } finally {await request.delete('/api/entities/artifacts/'+artifactId);await request.delete('/api/entities/conversations/'+id);}
});
test('mobile settings and composer stay within the viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/new');await expect(page.getByRole('textbox',{name:'Message',exact:true})).toBeVisible();if(await page.getByRole('button',{name:'Show sidebar'}).isVisible())await page.getByRole('button',{name:'Show sidebar'}).click();await page.getByRole('button',{name:'Open settings'}).click();await expect(page.getByRole('heading',{name:'Settings',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.getByRole('button',{name:'Close settings'}).click();
});
