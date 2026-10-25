import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {WebBrowserRuntime} from '../../server/browser/web.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {localFixture} from './local-fixture.ts';
test('backend Playwright browser uses scoped HTML, fresh references and real screenshots',{timeout:120000},async()=>{
 const fixture=await localFixture();const {context}=fixture;const browser=context.ephemeral.get('webBrowser');const owner='browser-proof';
 const call=(name:string,args:any)=>browser.tool(name,args,owner);
 try{let snapshot=(await browser.openDocument(owner,'<html><title>Horizon browser proof</title><body><label>Name<input aria-label="Name"></label><button onclick="document.querySelector(\'p\').textContent=document.querySelector(\'input\').value">Apply</button><p>Waiting</p></body></html>','proof.html')).snapshot;
 assert.match(snapshot.text,/Waiting/);const stale={...snapshot};const field=snapshot.elements.find((item:any)=>item.name==='Name');assert.ok(field);
 snapshot=(await call('browser_fill',{tab_id:snapshot.tab_id,snapshot_id:snapshot.snapshot_id,ref:field.ref,value:'Actual browser input'})).snapshot;
 await assert.rejects(call('browser_click',{tab_id:stale.tab_id,snapshot_id:stale.snapshot_id,ref:field.ref}),/Inspect the browser page again/);
 const button=snapshot.elements.find((item:any)=>item.name==='Apply');assert.ok(button);snapshot=(await call('browser_click',{tab_id:snapshot.tab_id,snapshot_id:snapshot.snapshot_id,ref:button.ref})).snapshot;assert.match(snapshot.text,/Actual browser input/);
 const image=(await call('browser_screenshot',{tab_id:snapshot.tab_id})).screenshot;const bytes=Buffer.from(image.image,'base64');assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),1280);assert.equal(bytes.readUInt32BE(20),800);
 await assert.rejects(call('browser_open',{url:'http://127.0.0.1:8099'}),/private network/i);
 await call('browser_tabs',{action:'close',tab_id:snapshot.tab_id});assert.deepEqual((await browser.view(owner)).tabs,[]);
 }finally{await fixture.close();}
});

test('backend browser approved download saves actual bytes from a controlled fixture',{timeout:120000},async()=>{
 const fixture=await localFixture();const browser=new WebBrowserRuntime(true); // Local egress allowed only in this isolated fixture.
 const server=createServer((request,response)=>{if(request.url==='/report.csv'){response.writeHead(200,{'Content-Type':'text/csv','Content-Disposition':'attachment; filename="report.csv"'});response.end('item,count\nverified,7\n');}else{response.writeHead(200,{'Content-Type':'text/html'});response.end('<a href="/report.csv" download>Download report</a>');}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const address=server.address();assert.ok(address&&typeof address!=='string');const owner='download-proof';const snapshot=(await browser.tool('browser_open',{url:'http://127.0.0.1:'+address.port},owner)).snapshot;const link=snapshot.elements.find((item:any)=>item.name==='Download report');assert.ok(link);
 await assert.rejects(browser.tool('browser_download',{tab_id:snapshot.tab_id,snapshot_id:snapshot.snapshot_id,ref:link.ref},owner),/approved download/i);
 const result=await browser.tool('browser_download',{tab_id:snapshot.tab_id,snapshot_id:snapshot.snapshot_id,ref:link.ref,download_directory:fixture.directory},owner);assert.equal(result.name,'report.csv');assert.equal(await readFile(result.saved_path,'utf8'),'item,count\nverified,7\n');assert.ok(result.saved_path.startsWith(join(fixture.directory,'')));
 }finally{await browser.dispose();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await fixture.close();}
});
