import {test,expect} from '@playwright/test';
test('cloud connection and external search settings are usable in the web edition',async({page})=>{
 let settings:any={id:'main',userName:'',model:'vendor/model',providerId:'router'},providers:any[]=[{id:'router',name:'OpenRouter',type:'openai',baseUrl:'https://openrouter.ai/api/v1',hasApiKey:true}],saved:any;
 await page.route(url=>url.pathname.startsWith('/api/'),async route=>{const url=new URL(route.request().url()),path=url.pathname;let data:any=[];
  if(path==='/api/entities/settings'){if(route.request().method()==='POST'){settings={...settings,...route.request().postDataJSON()};data=settings;}else data=[settings];}
  else if(path==='/api/entities/providers'){if(route.request().method()==='POST'){saved=route.request().postDataJSON();providers=[{...saved,id:'router',hasApiKey:true}];data=providers[0];}else data=providers;}
  else if(path==='/api/models')data={models:[{id:'vendor/model',name:'Cloud Test Model',providerId:'router',providerName:'OpenRouter'}],providers:[]};
  else if(path==='/api/model-configuration')data={};
  else if(path==='/api/runtime/health')data={};
  else if(path==='/api/skills')data=[];
  await route.fulfill({json:data});
 });
 await page.goto('/new',{waitUntil:'domcontentloaded'});await expect(page.getByRole('button',{name:'Select model'})).toContainText('Cloud Test Model');
 await page.getByRole('button',{name:'Open settings',exact:true}).click();await page.getByRole('button',{name:'Models',exact:true}).click();
 await page.getByRole('button',{name:'Add connection',exact:true}).click();await page.getByLabel('Provider preset').selectOption('2');await expect(page.getByLabel('API base URL')).toHaveValue('https://openrouter.ai/api/v1');
 await page.getByLabel('API key',{exact:true}).fill('TEST_NOT_A_REAL_KEY');await page.getByLabel('Model IDs (optional, one per line)').fill('vendor/model');await page.getByRole('button',{name:'Save connection'}).click();expect(saved.type).toBe('openai');expect(saved.modelIds).toEqual(['vendor/model']);
 await page.getByRole('button',{name:'Capabilities',exact:true}).click();await page.getByRole('combobox',{name:'Provider',exact:true}).selectOption('custom');await expect(page.getByLabel('Search API endpoint')).toBeVisible();await expect(page.getByRole('button',{name:'Save API key'})).toBeVisible();await page.getByLabel('Search API endpoint').pressSequentially('https://search.example/search');await page.getByRole('button',{name:'Save endpoint',exact:true}).click();await expect(page.getByRole('status')).toContainText('Search endpoint saved');expect(settings.searchApiUrl).toBe('https://search.example/search');
 await page.screenshot({path:'.local/cloud-search-settings.png'});
});
