import {test,expect} from './test-fixture';
test('slash lists tools, at lists installed skills, and keyboard selection inserts without sending',async({page})=>{
 await page.route('**/api/tools',route=>route.fulfill({json:[{name:'calculate',description:'Calculate a numeric expression',available:true},{name:'web_search',description:'Search the web',available:true},{name:'slides_create',description:'Create a presentation',available:false,unavailableReason:'Document runtime unavailable'}]}));
 await page.route('**/api/skills',route=>route.fulfill({json:[{id:'front',name:'frontend-design',description:'Design a frontend',installed:true,available:true,enabled:true},{id:'not-installed',name:'uninstalled-skill',installed:false,available:true,enabled:true}]}));
 let sends=0;await page.route('**/api/runs',async route=>{sends++;await route.fulfill({status:400,json:{error:'Unexpected send'}});});
 await page.goto('/new');const message=page.getByRole('textbox',{name:'Message'});
 await message.fill('/');await expect(page.getByRole('listbox',{name:'Tools'})).toBeVisible();await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(3);
 await expect(page.getByRole('listbox').getByRole('option').filter({hasText:'slides_create'})).toHaveAttribute('aria-disabled','true');
 await message.fill('/web');await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(1);await message.press('Enter');await expect(message).toHaveValue('/web_search ');expect(sends).toBe(0);
 await message.fill('Please @front');await expect(page.getByRole('listbox',{name:'Skills'})).toBeVisible();await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(1);await message.press('Tab');await expect(message).toHaveValue('Please @frontend-design ');expect(sends).toBe(0);
 await message.fill('@');await message.press('Escape');await expect(page.getByRole('listbox')).toHaveCount(0);
 await message.fill('Contact me@example.com');await expect(page.getByRole('listbox')).toHaveCount(0);
 await message.fill('/');await message.press('ArrowDown');await message.press('Tab');await expect(message).toHaveValue('/web_search ');
});
