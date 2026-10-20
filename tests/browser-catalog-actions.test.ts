import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {WebBrowserRuntime} from '../server/browser/web.ts';
import {advertisedNativeTools} from '../server/runtime/native-broker.ts';

test('browser catalog actions operate on real dropdowns, checkboxes, history and waits',async()=>{
 const server=http.createServer((request,response)=>{response.setHeader('Content-Type','text/html');response.end('<html><head><title>'+request.url+'</title></head><body><select aria-label="Color"><option value="red">Red</option><option value="blue">Blue</option></select><label>Agree<input type="checkbox"></label><script>setTimeout(()=>{const p=document.createElement("p");p.id="late";p.textContent="Ready";document.body.append(p)},150)</script></body></html>');});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as any).port,browser=new WebBrowserRuntime(true),owner='catalog-test';
 try{let snapshot:any=(await browser.tool('browser_open',{url:`http://127.0.0.1:${port}/one`},owner)).snapshot;const tab_id=snapshot.tab_id;
  const dropdown=snapshot.elements.find((item:any)=>item.tag==='select');snapshot=(await browser.tool('browser_select_option',{tab_id,snapshot_id:snapshot.snapshot_id,ref:dropdown.ref,value:'blue'},owner)).snapshot;
  const selected=snapshot.elements.find((item:any)=>item.tag==='select');let inspected:any=await browser.tool('browser_inspect_element',{tab_id,snapshot_id:snapshot.snapshot_id,ref:selected.ref},owner);assert.equal(inspected.element.value,'blue');
  const checkbox=snapshot.elements.find((item:any)=>item.type==='checkbox');snapshot=(await browser.tool('browser_check',{tab_id,snapshot_id:snapshot.snapshot_id,ref:checkbox.ref,checked:true},owner)).snapshot;const checked=snapshot.elements.find((item:any)=>item.type==='checkbox');inspected=await browser.tool('browser_inspect_element',{tab_id,snapshot_id:snapshot.snapshot_id,ref:checked.ref},owner);assert.equal(inspected.element.checked,true);
  snapshot=(await browser.tool('browser_wait_for_element',{tab_id,selector:'#late',timeout_ms:2000},owner)).snapshot;assert.match(snapshot.text,/Ready/);
  await browser.tool('browser_open',{tab_id,url:`http://127.0.0.1:${port}/two`},owner);snapshot=(await browser.tool('browser_back',{tab_id},owner)).snapshot;assert.equal(snapshot.title,'/one');snapshot=(await browser.tool('browser_forward',{tab_id},owner)).snapshot;assert.equal(snapshot.title,'/two');snapshot=(await browser.tool('browser_reload',{tab_id},owner)).snapshot;assert.equal(snapshot.title,'/two');
 }finally{await browser.dispose();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});

test('desktop advertises only compiled, known browser actions and granted channels',()=>{
 const legacy=advertisedNativeTools({browser:true});assert.ok(!legacy.includes('browser_back'));assert.ok(!legacy.includes('terminal_run'));
 const updated=advertisedNativeTools({browser:true,browserTools:['browser_back','browser_check','invented_tool'],terminal:true,computer:false});assert.ok(updated.includes('browser_back'));assert.ok(updated.includes('browser_check'));assert.ok(updated.includes('terminal_run'));assert.ok(!updated.includes('invented_tool'));assert.ok(!updated.includes('computer_click'));
});
