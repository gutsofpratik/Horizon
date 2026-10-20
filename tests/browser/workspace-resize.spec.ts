import {test,expect} from '@playwright/test';
test('workspace width responds to dragging and keyboard, persists and resets',async({page})=>{
 await page.setViewportSize({width:1440,height:950});await page.addInitScript(()=>localStorage.removeItem('openclaude.workspace.width'));await page.goto(process.env.OPENCLAUDE_RESIZE_TEST_URL??'/new',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Open workspace'}).click();
 const panel=page.locator('.activity-panel'),grip=page.getByRole('separator',{name:'Resize workspace'});
 const original=(await panel.boundingBox())!.width;const box=(await grip.boundingBox())!;
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x-160,box.y+box.height/2,{steps:8});await page.mouse.up();
 await expect.poll(async()=>(await panel.boundingBox())!.width).toBeGreaterThan(original+130);
 const wider=(await panel.boundingBox())!.width;await grip.focus();await page.keyboard.press('ArrowRight');await expect.poll(async()=>(await panel.boundingBox())!.width).toBeLessThan(wider);
 const saved=(await panel.boundingBox())!.width;await page.getByRole('button',{name:'Close workspace'}).click();await page.getByRole('button',{name:'Open workspace'}).click();await expect.poll(async()=>Math.abs((await panel.boundingBox())!.width-saved)).toBeLessThan(2);
 await page.getByRole('separator',{name:'Resize workspace'}).dblclick();await expect.poll(async()=>Math.abs((await panel.boundingBox())!.width-430)).toBeLessThan(2);
});

test('browser options expose native actions and hide unsupported password import',async({page})=>{
 await page.addInitScript(()=>{(window as any).browserCalls=[];(window as any).claudeDesktop={browserState:async()=>({activeId:'tab',tabs:[{id:'tab',url:'https://example.com',title:'Example'}],url:'https://example.com'}),browserBounds:async()=>{},browserManage:async(action:string,args:any)=>{(window as any).browserCalls.push({action,args});if(action==='data')return {history:[{url:'https://example.com',time:1700000000}],downloads:[{url:'https://example.com/file.pdf',path:'C:/Downloads/file.pdf',status:'completed',time:1700000000}],preferences:{passwords:true,autofill:true}};if(action==='extensions')return {extensions:[]};return {};}};});
 await page.goto(process.env.OPENCLAUDE_RESIZE_TEST_URL??'http://127.0.0.1:3001/desktop/new',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Open workspace'}).click();await page.getByRole('button',{name:'Browser options'}).click();
 await expect(page.getByRole('button',{name:'Find in page'})).toBeVisible();await page.getByRole('button',{name:'Downloads',exact:true}).click();await expect(page.getByText('file.pdf',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'History',exact:true}).click();await expect(page.getByRole('textbox',{name:'Search browser history'})).toBeVisible();
 await page.getByRole('button',{name:'Extensions',exact:true}).click();await expect(page.getByRole('button',{name:'Load unpacked extension…'})).toBeVisible();
 await page.getByRole('button',{name:'Passwords & data'}).click();await expect(page.getByRole('button',{name:'Import passwords · unavailable in WebView2'})).toBeDisabled();await expect(page.getByRole('checkbox',{name:'Offer to save passwords'})).toBeChecked();
 await page.getByRole('button',{name:'Page tools',exact:true}).click();await page.getByRole('button',{name:'Find in page'}).click();await page.getByRole('textbox',{name:'Find in page'}).fill('example');await page.getByRole('button',{name:'Next',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).browserCalls.some((call:any)=>call.action==='find'&&call.args.text==='example'))).toBe(true);
});
