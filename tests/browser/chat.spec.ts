import {test,expect} from './test-fixture';
test('UI can save through the development proxy while foreign origins are rejected',async({page,request})=>{
 await page.goto('/new');
 const result=await page.evaluate(async()=>{
  const response=await fetch('/api/entities/memories',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'Origin regression test'})});
  const data=await response.json();
  if(response.ok)await fetch('/api/entities/memories/'+data.id,{method:'DELETE'});
  return {status:response.status,error:data.error};
 });
 expect(result.status,result.error).toBe(200);
 const rejected=await request.post('/api/entities/memories',{headers:{Origin:'https://unrelated.example'},data:{text:'Must be rejected'}});
 expect(rejected.status()).toBe(403);
});
test('new chat exposes an accessible composer and the live model selector',async({page})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'New chat',exact:true})).toBeVisible();await expect(page.getByRole('textbox',{name:'Message',exact:true})).toBeVisible();await page.getByRole('button',{name:'Select model'}).click();await expect(page.getByRole('textbox',{name:'Search models'})).toBeVisible();await expect(page.getByText('qwen3.5:9b-q4_K_M',{exact:true}).last()).toBeVisible();
});
test('projects and artifacts are real navigable views',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Projects',exact:true}).click();await expect(page.getByRole('heading',{name:'Projects',exact:true})).toBeVisible();await page.getByRole('button',{name:'Artifacts',exact:true}).click();await expect(page.getByRole('heading',{name:'Artifacts',exact:true})).toBeVisible();
});
