import test from 'node:test';
import assert from 'node:assert/strict';
import {extractPageLinks} from '../server/search/fetch.ts';
import {ToolRegistry} from '../server/tools/registry.ts';
import {registerWebTools} from '../server/tools/web.ts';
import {registerToolGroups,categoryDefinitions} from '../server/tools/groups.ts';
import {Store} from '../server/storage/database.ts';

test('public page links are normalized and bounded, and web actions remain grouped',()=>{
 const links=extractPageLinks('<a href="/guide">Guide</a><a href="https://example.com/guide">Duplicate</a><a href="javascript:alert(1)">Unsafe</a><a href="#section">Same page</a>','https://example.com/start');
 assert.deepEqual(links,[{url:'https://example.com/guide',text:'Guide'}]);
 const store=new Store(':memory:');const registry=new ToolRegistry({store,ephemeral:new Map()} as any);registerWebTools(registry);registerToolGroups(registry);
 try{const defs=categoryDefinitions(registry.definitions());const web=defs.find(item=>item.function.name==='web');assert.ok(web);assert.ok(JSON.stringify(web.function.parameters).includes('extract_links'));assert.ok(JSON.stringify(web.function.parameters).includes('find_text'));}finally{store.close();}
});
