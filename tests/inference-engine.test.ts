import test from 'node:test';import assert from 'node:assert/strict';
import {engineFor,validateModelSettings} from '../server/models/engines.ts';
test('selects engines across model families and rejects unsupported platform combinations',()=>{
 assert.equal(engineFor('any.gguf',{},'win32','x64'),'llama.cpp');
 assert.equal(engineFor('folder',{},'win32','x64'),'transformers');
 assert.equal(engineFor('folder',{engine:'mlx'},'darwin','arm64'),'mlx');
 assert.throws(()=>engineFor('folder',{engine:'mlx'},'win32','x64'),/Apple Silicon/);
 assert.throws(()=>engineFor('folder',{engine:'llama.cpp'},'win32','x64'),/GGUF/);
 assert.throws(()=>engineFor('any.gguf',{device:'metal'},'win32','x64'),/Metal/);
 assert.throws(()=>engineFor('any.gguf',{device:'cuda'},'darwin','arm64'),/CUDA/);
});
test('preserves exact context settings and validates hardware controls',()=>{
 const config={contextTokens:150000,outputTokens:4096,threads:8,gpuLayers:0,batchSize:512,engine:'llama.cpp',device:'cpu'};
 assert.deepEqual(validateModelSettings(config),config);
 assert.throws(()=>validateModelSettings({contextTokens:128,outputTokens:256}),/Output/);
 assert.throws(()=>validateModelSettings({gpuLayers:-2}),/GPU/);
 assert.throws(()=>validateModelSettings({threads:0}),/threads/);
 assert.deepEqual(validateModelSettings({contextTokens:150000,cacheType:'q8_0',microBatchSize:128,device:'cuda'}),{contextTokens:150000,cacheType:'q8_0',microBatchSize:128,device:'cuda'});
 assert.throws(()=>validateModelSettings({cacheType:'invalid'}),/cache/);
 assert.deepEqual(validateModelSettings({parallelPredictions:4,memoryMode:'balanced'}),{parallelPredictions:4,memoryMode:'balanced'});
 assert.throws(()=>validateModelSettings({parallelPredictions:0}),/parallelPredictions/);
 assert.throws(()=>validateModelSettings({memoryMode:'invalid'}),/memory/);
});
