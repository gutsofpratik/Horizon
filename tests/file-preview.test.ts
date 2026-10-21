import test from 'node:test';import assert from 'node:assert/strict';import Fastify from 'fastify';import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {Store} from '../server/storage/database.ts';import {ToolRegistry} from '../server/tools/registry.ts';import {registerFileRoutes} from '../server/files/routes.ts';
test('file previews use inline responses and sandboxing without exposing filesystem paths',async()=>{
 const root=mkdtempSync(join(tmpdir(),'openclaude-preview-')),store=new Store(':memory:'),app=Fastify();const context:any={store,ephemeral:new Map(),dataDirectory:root};
 const path=join(root,'demo.html');writeFileSync(path,'<h1>Preview</h1>');store.put('files',{id:'html',name:'demo.html',mediaType:'text/plain',absolutePath:path,size:16});store.put('files',{id:'office',name:'document.docx',absolutePath:path});registerFileRoutes(app,context,new ToolRegistry(context));
 try{const info=await app.inject('/api/files/html/info');assert.equal(info.json().mediaType,'text/html');assert.ok(!info.body.includes(root));const preview=await app.inject('/api/files/html/preview');assert.match(String(preview.headers['content-disposition']),/^inline/);assert.match(String(preview.headers['content-security-policy']),/sandbox/);assert.equal(preview.body,'<h1>Preview</h1>');assert.equal((await app.inject('/api/files/office/info')).json().previewable,false);assert.equal((await app.inject('/api/files/missing/preview')).statusCode,404);}finally{await app.close();store.close();rmSync(root,{recursive:true,force:true});}
});
test('generated files survive reopening a conversation and exclude preview resources and other scopes',async()=>{
 const store=new Store(':memory:'),app=Fastify(),context:any={store,ephemeral:new Map()};
 store.put('conversations',{id:'chat-a'});store.put('conversations',{id:'chat-b'});
 store.put('files',{id:'workbook',name:'balance.xlsx',scope:'chat-a',absolutePath:'private-path',size:120});
 store.put('files',{id:'html-preview',name:'preview.html',scope:'chat-a',sourceFileId:'workbook',absolutePath:'private-preview'});
 store.put('files',{id:'other',name:'other.pdf',scope:'chat-b',absolutePath:'other-private'});
 registerFileRoutes(app,context,new ToolRegistry(context));
 try{const response=await app.inject('/api/conversations/chat-a/files');assert.equal(response.statusCode,200);assert.deepEqual(response.json().files.map((file:any)=>file.id),['workbook']);assert.ok(!response.body.includes('private-path'));assert.equal((await app.inject('/api/conversations/missing/files')).statusCode,404);context.ephemeral.set('private-chat',{id:'private-chat',incognito:true});assert.deepEqual((await app.inject('/api/conversations/private-chat/files')).json().files,[]);}finally{await app.close();store.close();}
});
