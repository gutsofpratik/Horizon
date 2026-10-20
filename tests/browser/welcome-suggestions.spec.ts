import {test,expect} from '@playwright/test';
test('welcome categories rotate relevant suggestions without changing or sending the draft',async({page})=>{
 let sends=0;page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/api/runs'))sends++;});
 await page.goto('http://127.0.0.1:3001/desktop/new');
 for(const label of ['Your local workspace','Local models connected','Personal · local','Powered by your models. Built for your ideas.'])await expect(page.getByText(label,{exact:true})).toHaveCount(0);
 const composer=page.getByRole('textbox',{name:'Message',exact:true});await composer.fill('My unsent draft');await page.getByRole('button',{name:'Learn',exact:true}).click();
 const learning=page.getByLabel('Learn suggestions');await expect(learning.getByRole('button')).toHaveCount(3);const first=await learning.getByRole('button').allTextContents();await expect(composer).toHaveValue('My unsent draft');await page.getByRole('button',{name:'Learn',exact:true}).click();const second=await learning.getByRole('button').allTextContents();expect(second.some(text=>first.includes(text))).toBe(false);
 await page.getByRole('button',{name:'Code',exact:true}).click();const coding=page.getByLabel('Code suggestions');await expect(coding.getByRole('button')).toHaveCount(3);expect(await coding.textContent()).toMatch(/build|prototype|creating|data model|Create/i);
 await page.getByRole('button',{name:'Explore',exact:true}).click();await expect(page.getByLabel('Explore suggestions').getByRole('button')).toHaveCount(3);await page.getByRole('button',{name:'Write',exact:true}).click();const suggestion=page.getByLabel('Write suggestions').getByRole('button').first();const text=await suggestion.innerText();await suggestion.click();await expect(composer).toHaveValue(text);expect(sends).toBe(0);
});
