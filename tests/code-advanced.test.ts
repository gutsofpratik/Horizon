import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {registerCodeAdvancedTools} from '../server/tools/code-advanced.ts';
import {workspaceRoot} from '../server/tools/files.ts';

test('AST symbol search, literal code search, streaming hash and command argument validation',async()=>{
 const dataDirectory=await mkdtemp(join(tmpdir(),'horizon-code-')),tools=new Map<string,any>();
 const ctx:any={app:{dataDirectory,store:{list:()=>[]},ephemeral:new Map()},conversationId:'test',runId:'run',signal:new AbortController().signal};
 const registry:any={tools,register:(tool:any)=>tools.set(tool.name,tool)};registerCodeAdvancedTools(registry);
 const call=(name:string,args:any)=>tools.get(name).handler(tools.get(name).input.parse(args),ctx);
 try{const root=workspaceRoot(ctx);await mkdir(root,{recursive:true});const text='// function fake() {}\nexport function realThing() { return 1; }\nconst answer = 42;';await writeFile(join(root,'sample.ts'),text);await writeFile(join(root,'other.py'),'def realThing(): pass');await mkdir(join(root,'node_modules'));await writeFile(join(root,'node_modules','hidden.ts'),'function realHidden() {}');
  const symbols=await call('symbol_search',{query:'real'});assert.deepEqual(symbols.results.map((v:any)=>v.name),['realThing']);assert.deepEqual(symbols.unsupported_extensions,['.py']);assert.equal(symbols.results[0].line,2);
  assert.equal((await call('symbol_search',{query:'fake'})).results.length,0);
  const matches=await call('code_search',{query:'realThing',max_results:1});assert.equal(matches.results.length,1);assert.equal(matches.truncated,true);
  const hash=await call('files_hash',{path:'sample.ts'});assert.equal(hash.hash,createHash('sha256').update(text).digest('hex'));assert.equal(hash.bytes,Buffer.byteLength(text));
  await assert.rejects(call('files_hash',{path:'../escape'}));
  assert.equal(tools.get('code_test').input.safeParse({script:'test; whoami'}).success,false);
  assert.equal(tools.get('code_format').capability,'terminal');
 }finally{await rm(dataDirectory,{recursive:true,force:true});}
});
