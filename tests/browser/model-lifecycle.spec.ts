import {test,expect} from '@playwright/test';
test('choosing does not load a model; sending posts the prompt without waiting for preparation',async({page})=>{
 const prepared:any[]=[];const runs:any[]=[];const models=[{id:'a',name:'Model A',providerId:'builtin',providerName:'OpenClaude',local:true,loaded:true},{id:'b',name:'Model B',providerId:'builtin',providerName:'OpenClaude',local:true,loaded:false}];
 await page.route('**/api/models',route=>route.fulfill({json:{models}}));
 await page.route('**/api/entities/settings',route=>route.fulfill({json:route.request().method()==='GET'?[{id:'main',providerId:'builtin',model:'a',theme:'dark'}]:route.request().postDataJSON()}));
 await page.route('**/api/model-library/prepare',route=>{prepared.push(route.request().postDataJSON());return route.fulfill({json:{status:'loaded'}});});
 await page.route('**/api/runs',route=>{runs.push(route.request().postDataJSON());return route.fulfill({status:400,json:{error:'Test stopped before generation'}});});
 await page.goto('http://127.0.0.1:3001/desktop/new');await page.getByRole('button',{name:'Select model',exact:true}).click();await page.getByRole('option',{name:/Model B/}).click();
 await expect(page.getByRole('button',{name:'Select model',exact:true})).toContainText('Model B');expect(prepared).toHaveLength(0);
 await page.getByRole('textbox',{name:'Message',exact:true}).fill('Hello');await page.getByRole('button',{name:'Send message',exact:true}).click();
 expect(prepared).toHaveLength(0);await expect.poll(()=>runs.length).toBe(1);expect(runs[0].model).toBe('b');
});
test('All Models offers Ollama import without load or unload actions',async({page})=>{
 let imported:any;await page.route('**/api/model-library',route=>route.fulfill({json:{models:[{id:'a',name:'Example',path:'model.gguf',configuration:{}}],loaded:{modelId:'a',device:'cuda',configuration:{contextTokens:150000}},status:'loaded'}}));
 await page.route('**/api/model-library/ollama',route=>route.fulfill({json:{models:[{id:'local-ollama-model',name:'Ollama example:latest',available:true}]}}));
 await page.route('**/api/model-library/ollama/import',route=>{imported=route.request().postDataJSON();return route.fulfill({json:{id:'imported'}});});
 await page.goto('http://127.0.0.1:3001/desktop/new');await page.getByRole('button',{name:'Open settings',exact:true}).click();await page.getByRole('button',{name:'Models',exact:true}).click();
 await expect(page.getByRole('button',{name:/^(Load model|Unload)$/})).toHaveCount(0);
 await page.getByRole('button',{name:'Import from Ollama',exact:true}).click();await expect(page.getByText('Ollama example:latest',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Import',exact:true}).click();await expect.poll(()=>imported?.id).toBe('local-ollama-model');
});
