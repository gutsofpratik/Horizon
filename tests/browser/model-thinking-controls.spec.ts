import {test,expect} from '@playwright/test';

test('thinking appears under effort in the model menu and persisted into the next request',async({page})=>{
 const runs:any[]=[];const saved:any[]=[];
 await page.route('**/api/models',route=>route.fulfill({json:{models:[{id:'reasoner',name:'Native reasoner',providerId:'builtin',providerName:'Built-in',local:true,loaded:true,capabilities:['tools','vision','thinking'],reasoningMode:'native'}]}}));
 await page.route('**/api/entities/settings',route=>{if(route.request().method()==='GET')return route.fulfill({json:[{id:'main',providerId:'builtin',model:'reasoner',thinking:false,theme:'dark'}]});const value=route.request().postDataJSON();saved.push(value);return route.fulfill({json:value});});
 await page.route('**/api/runs',route=>{runs.push(route.request().postDataJSON());return route.fulfill({status:400,json:{error:'Stopped before inference'}});});
 await page.goto('http://127.0.0.1:3001/desktop/new');
 await page.getByRole('button',{name:'Select model',exact:true}).click();
 await expect(page.getByRole('option',{name:/Native reasoner/})).toContainText('Thinking');
 await page.getByRole('button',{name:/Effort mode/}).click();
 const enabled=page.getByRole('button',{name:'Thinking',exact:true});
 await expect(enabled).toBeVisible();await expect(enabled).toHaveAttribute('aria-pressed','false');
 await enabled.click();await expect(enabled).toHaveAttribute('aria-pressed','true');
 await expect.poll(()=>saved.at(-1)?.thinking).toBe(true);
 await page.keyboard.press('Escape');
 await page.getByRole('textbox',{name:'Message',exact:true}).fill('Think through this task');await page.getByRole('button',{name:'Send message',exact:true}).click();
 await expect.poll(()=>runs.length).toBe(1);expect(runs[0].thinking).toBe(true);
});
