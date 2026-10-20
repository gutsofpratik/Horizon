import {test,expect} from '@playwright/test';
test('chat links open the embedded browser and HTML files stay in an isolated internal preview',async({page,context})=>{
 const chat={id:'internal-links',title:'Links',headId:'a',messages:[{id:'u',role:'user',parentId:null,content:'Show links'},{id:'a',role:'assistant',parentId:'u',status:'completed',content:'[Website](https://example.com/page) and [HTML file](/api/files/demo-html)'}]};
 await page.route('**/api/entities/conversations/internal-links',route=>route.fulfill({json:chat}));
 await page.route('**/api/artifact-drafts?**',route=>route.fulfill({json:{drafts:[]}}));
 let opened='';await page.route('**/api/browser/**',async route=>{if(route.request().method()==='POST')opened=route.request().postDataJSON().url;await route.fulfill({json:{tabs:opened?[{id:'test',url:opened,title:'Example'}]:[],activeId:opened?'test':null,url:opened}});});
 await page.route('**/api/files/demo-html/info',route=>route.fulfill({json:{name:'demo.html',mediaType:'text/html',previewable:true,url:'/api/files/demo-html',previewUrl:'/api/files/demo-html/preview'}}));
 await page.route('**/api/files/demo-html/preview',route=>route.fulfill({body:'<h1>Local HTML</h1><a href="https://example.com/from-preview" target="_blank">Open from HTML</a>',contentType:'text/html'}));
 await page.goto('/chat/internal-links');await page.getByRole('link',{name:'Website',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Browser address'})).toHaveValue('https://example.com/page');expect(opened).toBe('https://example.com/page');expect(context.pages()).toHaveLength(1);
 await page.getByRole('link',{name:'HTML file',exact:true}).click();await expect(page.frameLocator('iframe[title="demo.html"]').getByRole('heading',{name:'Local HTML'})).toBeVisible();
 await page.frameLocator('iframe[title="demo.html"]').getByRole('link',{name:'Open from HTML'}).click();await expect(page.getByRole('textbox',{name:'Browser address'})).toHaveValue('https://example.com/from-preview');expect(context.pages()).toHaveLength(1);
});

test('an agent-opened browser tab becomes visible without navigating twice',async({page})=>{
 let opens=0;const url='https://workspace.openclaude.invalid/test/index.html';
 await page.route('**/api/browser/**',async route=>{if(route.request().method()==='POST')opens++;await route.fulfill({json:{tabs:[{id:'local',url,title:'Workspace HTML'}],activeId:'local',url}});});
 await page.goto('/new');await expect(page.getByRole('textbox',{name:'Message'})).toBeVisible();
 await page.evaluate(url=>window.dispatchEvent(new CustomEvent('openclaude:open-browser',{detail:{id:'agent-open',url,alreadyOpen:true,preview:false}})),url);
 await expect(page.getByRole('textbox',{name:'Browser address'})).toHaveValue(url);expect(opens).toBe(0);
});
