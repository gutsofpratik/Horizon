import {test,expect} from './test-fixture';
test('model menu search toggles retain exclusive research behavior',async({page})=>{
 await page.route('**/api/entities/settings',async route=>{if(route.request().method()==='POST')return route.fulfill({json:route.request().postDataJSON()});const response=await route.fetch();return route.fulfill({json:{...await response.json(),researchStrategy:'standard',researchTarget:100}});});
 await page.goto('/new');
 await expect(page.getByRole('combobox',{name:'Research mode',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Select model'}).click();
 const search=page.getByRole('switch',{name:'Deep Search',exact:true});
 const research=page.getByRole('switch',{name:'Deep Research',exact:true});
 await search.click();
 await expect(search).toBeChecked();
 await expect(page.getByRole('spinbutton',{name:'Required websites'})).toHaveCount(0);
 await expect(page.getByText('At least 100 websites must be read.',{exact:true})).toHaveCount(0);
 await research.click();
 await expect(research).toBeChecked();
 await expect(search).not.toBeChecked();
 await expect(page.getByText('Plan, investigate, and write a cited report with relevant installed skills.')).toHaveCount(0);
 await expect(page.getByRole('spinbutton',{name:'Required websites'})).toHaveCount(0);
 await research.click();
 await expect(research).not.toBeChecked();
 await expect(search).not.toBeChecked();
});

