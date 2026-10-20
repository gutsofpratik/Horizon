import {test,expect} from '@playwright/test';
test('desktop controls auto-start terminal and navigate without popups or an enable button',async({page})=>{
 await page.route('**/api/native/tauri/**',route=>route.fulfill({json:route.request().url().endsWith('/commands')?[]:{connected:true}}));
 await page.route('**/api/tools/call',route=>route.fulfill({json:{status:'succeeded',data:{screenshot:{image:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE1cAAAAASUVORK5CYII='}}}}));
 await page.addInitScript(()=>{const state:any={tabs:[]};(window as any).nativeCalls=[];(window as any).__TAURI_INTERNALS__={invoke:async(name:string,args:any)=>{(window as any).nativeCalls.push({name,args});if(name==='computer_status'||name==='workspace_status')return true;if(name==='workspace_current')return {id:'workspace',name:'Current project',path:'C:/current-project'};if(name==='terminal_open')return {id:'terminal',status:'running'};if(name==='terminal_read')return {output:args.offset?'':'PS C:\\current-project> ',nextOffset:24,status:'running',exitCode:null};if(name==='browser_navigate'){state.tabs=[{id:'tab',title:'Google',url:args.url}];state.url=args.url;state.activeId='tab';}if(name.startsWith('browser_'))return state;return {};}};});
 let popups=0;page.on('popup',()=>popups++);
 await page.goto('http://127.0.0.1:3001/desktop/new');await page.getByRole('button',{name:'Open workspace',exact:true}).click();await page.getByRole('button',{name:'Go',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).nativeCalls.filter((call:any)=>call.name==='browser_navigate').length)).toBe(1);expect(popups).toBe(0);
 await page.getByRole('button',{name:'terminal',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).nativeCalls.filter((call:any)=>call.name==='terminal_open').length)).toBe(1);await expect(page.getByRole('button',{name:/Choose folder|Start native terminal/})).toHaveCount(0);
 await page.getByRole('button',{name:'Computer use',exact:true}).click();await expect(page.getByRole('button',{name:'Enable Windows control',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Refresh screen',exact:true})).toBeVisible();
});
test('an exited terminal retains output and stops input and resize commands',async({page})=>{
 await page.route('**/api/native/tauri/**',route=>route.fulfill({json:route.request().url().endsWith('/commands')?[]:{connected:true}}));
 await page.addInitScript(()=>{(window as any).nativeCalls=[];(window as any).__TAURI_INTERNALS__={invoke:async(name:string,args:any)=>{(window as any).nativeCalls.push({name,args});if(name==='computer_status'||name==='workspace_status')return true;if(name==='workspace_current')return {id:'workspace',name:'Current project',path:'C:/current-project'};if(name==='terminal_open')return {id:'terminal',status:'running'};if(name==='terminal_read')return {output:'Finished\r\n',nextOffset:10,status:'exited',exitCode:0};if(name==='terminal_write')throw new Error('The pipe is being closed. (os error 232)');if(name.startsWith('browser_'))return {tabs:[]};return {};}};});
 await page.goto('http://127.0.0.1:3001/desktop/new');await page.getByRole('button',{name:'Open workspace',exact:true}).click();await page.getByRole('button',{name:'terminal',exact:true}).click();
 await expect(page.locator('.native-terminal-toolbar [role=status]')).toHaveText('exited');await expect(page.getByRole('button',{name:'Restart terminal',exact:true})).toBeVisible();
 const commandCount=await page.evaluate(()=>(window as any).nativeCalls.filter((call:any)=>/terminal_(write|resize)/.test(call.name)).length);
 await page.setViewportSize({width:1100,height:750});await page.locator('.xterm-helper-textarea').focus();await page.keyboard.type('x');
 await expect(page.locator('.native-terminal-toolbar [role=status]')).toHaveText('exited');
 expect(await page.evaluate(()=>(window as any).nativeCalls.filter((call:any)=>/terminal_(write|resize)/.test(call.name)).length)).toBe(commandCount);
 await expect(page.getByText(/pipe is being closed|Terminal process has exited/)).toHaveCount(0);
});
