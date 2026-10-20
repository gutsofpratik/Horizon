import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/storage/database.ts';
import {searchWeb} from '../server/search/provider.ts';

test('search falls back to real HTML results when local SearXNG is offline',async()=>{
 const store=new Store(':memory:');const original=globalThis.fetch;const calls:string[]=[];
 globalThis.fetch=async(input:any)=>{const url=String(input);calls.push(url);if(url.startsWith('http://127.0.0.1:8081'))throw new TypeError('fetch failed');return new Response('<html><div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fdocs.ollama.com%2F">Ollama documentation</a><a class="result__snippet">Local models &amp; tools</a></div></html>');};
 try{const app={store,ephemeral:new Map()} as any;const result=await searchWeb(app,'Ollama',3);assert.equal(result.provider,'https://html.duckduckgo.com');assert.equal(result.sources[0].url,'https://docs.ollama.com/');assert.equal(result.sources[0].excerpt,'Local models & tools');assert.equal(result.fallback,true);assert.equal(calls.length,2);await searchWeb(app,'Ollama',3);assert.equal(calls.length,2);}finally{globalThis.fetch=original;store.close();}
});

test('explicit SearXNG selection reports failure without silently changing provider',async()=>{
 const store=new Store(':memory:');store.put('settings',{id:'main',searchProvider:'searxng'});const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new TypeError('fetch failed');};
 try{await assert.rejects(searchWeb({store,ephemeral:new Map()} as any,'test'),/Cannot reach search provider/);assert.equal(calls,1);}finally{globalThis.fetch=original;store.close();}
});

test('DuckDuckGo challenges are reported as failures rather than empty search success',async()=>{
 const store=new Store(':memory:');store.put('settings',{id:'main',searchProvider:'duckduckgo'});const original=globalThis.fetch;globalThis.fetch=async()=>new Response('<form id="challenge-form">Verify you are human</form>',{status:202});
 try{await assert.rejects(searchWeb({store,ephemeral:new Map()} as any,'test'),/challenge|blocked/i);}finally{globalThis.fetch=original;store.close();}
});

test('DuckDuckGo works with an invalid unused SearXNG address and forwards search filters',async()=>{
 const store=new Store(':memory:');store.put('settings',{id:'main',searchProvider:'duckduckgo',searchUrl:'broken address',safeSearch:2,searchLanguage:'fr'});const original=globalThis.fetch;let requested='';
 globalThis.fetch=async(input:any)=>{requested=String(input);return new Response('<div class="no-results">No results</div>');};
 try{await searchWeb({store,ephemeral:new Map()} as any,'query',5,'day');const url=new URL(requested);assert.equal(url.searchParams.get('kp'),'1');assert.equal(url.searchParams.get('kl'),'fr-fr');assert.equal(url.searchParams.get('df'),'d');}finally{globalThis.fetch=original;store.close();}
});
