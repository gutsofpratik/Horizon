import {test,expect} from '@playwright/test';

test('runtime settings expose scoped environments, lifecycle hooks, remote pairing and tool selection',async({page})=>{
 let settings:any={id:'main',theme:'light'};await page.route('**/api/entities/settings',route=>{if(route.request().method()==='GET')return route.fulfill({json:[settings]});settings={...settings,...route.request().postDataJSON()};return route.fulfill({json:settings});});
 await page.route('**/api/environments',route=>route.fulfill({json:{environments:[]}}));await page.route('**/api/remote/grants',route=>route.fulfill({json:{grants:[]}}));
 await page.goto('/new');await page.getByRole('button',{name:'Open settings',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Settings'});
 await dialog.getByRole('button',{name:'Capabilities',exact:true}).click();await expect(dialog.getByRole('heading',{name:'Tool selection'})).toBeVisible();await dialog.getByLabel('Behavior',{exact:true}).selectOption('specific');await expect(dialog.getByLabel('Category',{exact:true})).toBeVisible();await dialog.getByLabel('Category',{exact:true}).selectOption('browser');await expect.poll(()=>settings.toolSelection?.name).toBe('browser');
 await expect(dialog.getByLabel('Embedding model',{exact:true})).toBeVisible();await expect(dialog.getByLabel('Image provider',{exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'Environments',exact:true}).click();await expect(dialog.getByRole('heading',{name:'Execution environments'})).toBeVisible();await expect(dialog.getByLabel('Worker token',{exact:true})).toHaveAttribute('type','password');await expect(dialog.getByRole('button',{name:'Save environment'})).toBeDisabled();
 await dialog.getByRole('button',{name:'Lifecycle hooks',exact:true}).click();await expect(dialog.getByRole('heading',{name:'Lifecycle hooks'})).toBeVisible();await expect(dialog.getByLabel('Conversation',{exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'Remote control',exact:true}).click();await expect(dialog.getByRole('button',{name:'Create pairing code'})).toBeDisabled();await expect(dialog.getByLabel('Allow this device to answer approval requests')).not.toBeChecked();
});
