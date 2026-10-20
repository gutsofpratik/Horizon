import {test,expect} from '@playwright/test';
test('catalog source and download actions show visible details and honor the GGUF choice',async({page})=>{
 let download:any;const source={repo:'publisher/model',revision:'a'.repeat(40),engine:'auto',license:'apache-2.0',ggufFiles:[{name:'model-Q4.gguf',size:100},{name:'model-Q8.gguf',size:200}],resources:['tokenizer.json'],safetensorsFiles:['config.json','model.safetensors'],files:[{name:'model-Q4.gguf'},{name:'model-Q8.gguf'}]};
 await page.route('**/api/model-library/catalog?*',route=>route.fulfill({json:{models:[{id:source.repo,name:'Example model',publisher:'publisher',downloads:10,likes:2}]}}));
 await page.route('**/api/model-library/source?*',route=>route.fulfill({json:source}));
 await page.route('**/api/model-library/download',route=>{download=route.request().postDataJSON();return route.fulfill({json:{id:'download',repo:source.repo,status:'downloading'}});});
 await page.route('**/api/model-library/downloads/download',route=>route.fulfill({json:{id:'download',repo:source.repo,status:'completed'}}));
 await page.goto('http://127.0.0.1:3001/desktop/new');await page.getByRole('button',{name:'Open settings',exact:true}).click();await page.getByRole('button',{name:'Model library',exact:true}).click();
 const search=page.getByRole('textbox',{name:'Search model library'});await expect(search).toBeVisible();expect(await search.evaluate(element=>getComputedStyle(element.parentElement!).flexDirection)).toBe('row');
 await page.getByRole('button',{name:'View publisher/model source'}).click();const details=page.getByRole('dialog',{name:'Model source'});await expect(details).toBeVisible();await expect(details.getByText('License: apache-2.0')).toBeVisible();await details.getByRole('button',{name:'Close model details'}).click();
 await page.getByRole('button',{name:'Download',exact:true}).click();const choice=page.getByRole('dialog',{name:'Download model'});await expect(choice).toBeVisible();await choice.getByRole('combobox',{name:'Download variant'}).selectOption('model-Q8.gguf');await choice.getByRole('button',{name:'Download model',exact:true}).click();
 await expect.poll(()=>download?.files).toEqual(['model-Q8.gguf','tokenizer.json']);expect(download.configuration.engine).toBe('llama.cpp');await expect(page.getByText('Added to Models. Choose it in chat to use it.',{exact:true})).toBeVisible();
});
