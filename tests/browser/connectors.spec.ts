import {test,expect} from '@playwright/test';

test('editing a connector exposes Connect and browser authorization, then updates connected status',async({page,context})=>{
 let item:any={id:'ui-auth',name:'Calendar service',url:'https://connector.test/mcp',authMode:'oauth',status:'disconnected',toolCount:0};
 await page.route('**/api/connectors**',async route=>{
  const request=route.request();const path=new URL(request.url()).pathname;
  if(path.endsWith('/connect'))item={...item,status:'authorization_required',authorizationUrl:'https://connector.test/authorize'};
  else if(path.endsWith('/disconnect'))item={...item,status:'disconnected',toolCount:0,authorizationUrl:undefined};
  else if(request.method()==='POST')item={...item,...request.postDataJSON(),status:'disconnected'};
  await route.fulfill({json:request.method()==='GET'?[item]:item});
 });
 let opened='';await page.route('**/api/browser/**',async route=>{if(route.request().method()==='POST'){opened=route.request().postDataJSON().url;item={...item,status:'connected',toolCount:3,authorizationUrl:undefined};}await route.fulfill({json:{tabs:opened?[{id:'auth',url:opened,title:'Service authorization'}]:[],activeId:opened?'auth':null,url:opened}});});
 await page.goto('/skills');await page.getByRole('tab',{name:'Connectors',exact:true}).click();
 await expect(page.getByText('Not connected',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Edit connector Calendar service'}).click();
 await page.getByLabel('Name',{exact:true}).fill('My calendar');await page.getByRole('button',{name:'Save connector'}).click();
 await expect(page.getByText('My calendar',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Connect',exact:true}).click();
 await expect(page.getByText('Authorization required',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Authorize in browser'}).click();await expect(page.getByRole('textbox',{name:'Browser address'})).toHaveValue('https://connector.test/authorize');expect(opened).toBe('https://connector.test/authorize');expect(context.pages()).toHaveLength(1);
 await expect(page.locator('.connector-status')).toHaveText(/Connected.*3 tools/);
 await page.getByRole('button',{name:'Disconnect',exact:true}).click();await expect(page.getByText('Not connected',{exact:true})).toBeVisible();
});
