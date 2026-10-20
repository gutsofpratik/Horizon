import {test,expect} from '@playwright/test';
test('desktop model settings persist exact context and expose engine hardware controls',async({page})=>{
 let saved:any;const model={id:'engine-settings',name:'Portable GGUF',path:'C:/models/model.gguf',configuration:{contextTokens:4096,outputTokens:512}};
 await page.route('**/api/model-library',route=>route.fulfill({json:{models:[model],status:'idle',loaded:null}}));
 await page.route('**/api/model-library/engine-settings/configuration',async route=>{saved=route.request().postDataJSON().configuration;await route.fulfill({json:{...model,configuration:saved}});});
 await page.goto('http://127.0.0.1:3001/desktop/new');await page.getByRole('button',{name:'Open settings',exact:true}).click();await page.getByRole('button',{name:'Models',exact:true}).click();
 await page.getByRole('button',{name:'Settings for Portable GGUF'}).click();await expect(page.getByRole('dialog',{name:'Model settings: Portable GGUF',exact:true})).toBeVisible();await page.getByLabel('Inference engine',{exact:true}).selectOption('llama.cpp');await page.getByLabel('Total context window',{exact:true}).fill('150000');await page.getByLabel('CPU threads',{exact:true}).fill('8');await page.getByLabel('GPU layers (-1 = all)',{exact:true}).fill('20');
 await page.getByLabel('llama.cpp runtime',{exact:true}).selectOption('prism');await page.getByLabel('Vision projector file',{exact:true}).fill('C:/models/mmproj.gguf');await page.getByLabel('Maximum image tokens',{exact:true}).fill('1024');
 await page.getByLabel('Flash Attention',{exact:true}).selectOption('on');await page.getByLabel('Reuse prompt cache',{exact:true}).uncheck();
 await expect(page.getByLabel('Output token limit',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Save settings',exact:true}).click();await expect.poll(()=>saved?.contextTokens).toBe(150000);expect(saved.outputTokens).toBeUndefined();expect(saved).toMatchObject({engine:'llama.cpp',runtimeVariant:'prism',threads:8,gpuLayers:20,flashAttention:'on',promptCache:false,visionProjectorPath:'C:/models/mmproj.gguf',imageMaxTokens:1024});
});

