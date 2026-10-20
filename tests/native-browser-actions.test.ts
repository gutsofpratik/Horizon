import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {chromium} from 'playwright';
const rust=readFileSync('src-tauri/src/browser_tools.rs','utf8');
const template=[...rust.matchAll(/r#"([\s\S]*?)"#/g)].map(match=>match[1]).find(script=>script.includes('const name={name}'))!;
function action(name:string,args:any){return template.replaceAll('{{','{').replaceAll('}}','}').replace('{name}',JSON.stringify(name)).replace('{args}',JSON.stringify(args)).replace('{key}',JSON.stringify('__test_browser'));}
test('native browser page-level keypress needs no element snapshot, while targeted actions reject stale references',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();
 try{await page.setContent('<button>Next</button><p>Slide 1</p><script>let slide=1;document.addEventListener("keydown",event=>{if(event.key==="ArrowRight"){event.preventDefault();document.querySelector("p").textContent="Slide "+(++slide);}});</script>');
 const result:any=await page.evaluate(action('browser_press',{tab_id:'tab',key:'ArrowRight'}));assert.equal(result.error,undefined,JSON.stringify(result));assert.equal(await page.locator('p').textContent(),'Slide 2');
 await page.evaluate(()=>{(window as any).__test_browser={nonce:'current',elements:new Map([['1',document.querySelector('button')]])};});
 const stale:any=await page.evaluate(action('browser_click',{snapshot_id:'old',ref:'1'}));assert.match(stale.error,/Snapshot is stale/);
 }finally{await browser.close();}
});
