import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {browserAdvanced} from '../runtime/worker/browser-advanced.mjs';

test('worker page scripts time out outside the page and leave the browser usable',{timeout:15000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});try{const page=await browser.newPage();await page.setContent('<title>Still usable</title><main>Content</main>');const tab={page};const start=Date.now();await assert.rejects(browserAdvanced(tab,'browser_run_script',{source:'while(true){}',timeout_ms:150}),/timed out|execution|terminated/i);assert.ok(Date.now()-start<5000);if(!page.isClosed())assert.equal(await page.title(),'Still usable');const healthy=page.isClosed()?await browser.newPage():page;assert.equal((await browserAdvanced({page:healthy},'browser_run_script',{source:'return 7',timeout_ms:1000})).result,7);}finally{await browser.close();}
});
test('program runner dispatches actual allowed calls and propagates their results',{timeout:10000},async()=>{
 const child=spawn(process.execPath,['runtime/worker/program-runner.mjs'],{windowsHide:true,stdio:['pipe','pipe','pipe']});const events:any[]=[];let stderr='';child.stderr.on('data',data=>stderr+=data);const lines=createInterface({input:child.stdout});const finished=new Promise<void>((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(stderr)));});lines.on('line',line=>{const event=JSON.parse(line);events.push(event);if(event.type==='call'){assert.equal(event.name,'calculate');assert.deepEqual(event.arguments,{expression:'2+2'});child.stdin.write(JSON.stringify({type:'reply',id:event.id,result:{result:4}})+'\n');}});try{child.stdin.write(JSON.stringify({type:'start',tools:['calculate'],code:'const result=await tools.calculate({expression:"2+2"}); return result.result;'})+'\n');await finished;assert.equal(events.find(event=>event.type==='done').result,4);}finally{child.kill();lines.close();}
});
test('timed-out asynchronous page scripts cannot resume later in the old tab',{timeout:15000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});try{const page=await browser.newPage();await page.setContent('<main>Original</main>');await assert.rejects(browserAdvanced({page},'browser_run_script',{source:'await new Promise(resolve=>setTimeout(resolve,2000));document.body.textContent="Late mutation";',timeout_ms:100}),/timed out|execution/i);assert.equal(page.isClosed(),true);const clean=await browser.newPage();await clean.setContent('<main>Clean</main>');assert.equal(await clean.locator('main').textContent(),'Clean');}finally{await browser.close();}
});
test('Python kernel retains variables and recovers after execution errors',{timeout:10000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'openclaude-kernel-')),child=spawn('python',['-u','runtime/worker/python-kernel.py',directory],{windowsHide:true,stdio:['pipe','pipe','pipe']});let stderr='';child.stderr.on('data',data=>stderr+=data);const lines=createInterface({input:child.stdout});const replies:any[]=[];let resolve!:()=>void;const complete=new Promise<void>((done,reject)=>{resolve=done;child.once('error',reject);child.once('exit',code=>{if(replies.length<3)reject(Error(stderr||'Kernel exited '+code));});});lines.on('line',line=>{replies.push(JSON.parse(line));if(replies.length===3)resolve();});try{for(const [id,code] of [['one','value=42\nprint("saved")'],['two','raise ValueError("expected")'],['three','value+1']])child.stdin.write(JSON.stringify({id,code})+'\n');await complete;assert.equal(replies[0].stdout,'saved\n');assert.equal(replies[1].status,'failed');assert.equal(replies[2].result,'43');}finally{child.stdin.end();child.kill();lines.close();await new Promise(resolve=>child.exitCode!==null?resolve(null):child.once('exit',resolve));await rm(directory,{recursive:true,force:true});}
});
