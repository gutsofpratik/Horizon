import test from 'node:test';import assert from 'node:assert/strict';
import {ModelRuntime} from '../server/models/runtime.ts';
test('global context changes invalidate only models inheriting context defaults',async()=>{let defaults:any={minimumContext:4096};const runtime=new ModelRuntime('.','worker.py',()=>defaults);let loads=0;(runtime as any).load=async(entry:any)=>{loads++;runtime.loaded={modelId:entry.id};return runtime.loaded;};(runtime as any).unload=async()=>{runtime.loaded=null;};const automatic={id:'auto',path:'a.gguf',configuration:{}};await runtime.select(automatic);defaults={minimumContext:8192};assert.equal(runtime.isReady(automatic),false);await runtime.select(automatic);assert.equal(loads,2);const explicit={id:'fixed',path:'a.gguf',configuration:{contextTokens:60000}};await runtime.select(explicit);defaults={minimumContext:16384};assert.equal(runtime.isReady(explicit),true);await runtime.select({...explicit,configuration:{contextTokens:150000}});assert.equal(loads,4);});
test('selecting local models loads once and automatically releases the previous selection',async()=>{
 const runtime=new ModelRuntime('.');const actions:string[]=[];
 (runtime as any).load=async(entry:any)=>{actions.push('load:'+entry.id);runtime.loaded={modelId:entry.id,configuration:entry.configuration};return runtime.loaded;};
 (runtime as any).unload=async()=>{actions.push('unload');runtime.loaded=null;};
 const a={id:'a',path:'a.gguf',configuration:{contextTokens:150000}},b={id:'b',path:'b.gguf',configuration:{contextTokens:8192}};
 await Promise.all([runtime.select(a),runtime.select(a)]);await runtime.select(b);
 assert.deepEqual(actions,['load:a','unload','load:b']);
 await runtime.select({...b,configuration:{contextTokens:16000}});
 assert.deepEqual(actions.slice(-2),['unload','load:b']);
});
test('concurrent generations are serialized with their own model activation',async()=>{
 const runtime=new ModelRuntime('.');const actions:string[]=[];let active=0;
 (runtime as any).load=async(entry:any)=>{actions.push('load:'+entry.id);runtime.loaded={modelId:entry.id};return runtime.loaded;};
 (runtime as any).unload=async()=>{actions.push('unload');runtime.loaded=null;};
 (runtime as any).dispatch=async(_action:string,args:any)=>{assert.equal(active,0);assert.equal(runtime.loaded.modelId,args.model);active++;actions.push('generate:'+args.model);await new Promise(resolve=>setImmediate(resolve));active--;return {ok:true};};
 const a={id:'a',path:'a.gguf',configuration:{}},b={id:'b',path:'b.gguf',configuration:{}};
 await Promise.all([runtime.generateFor(a,{model:'a'}),runtime.generateFor(a,{model:'a'}),runtime.generateFor(b,{model:'b'})]);
 assert.deepEqual(actions,['load:a','generate:a','generate:a','unload','load:b','generate:b']);
});
