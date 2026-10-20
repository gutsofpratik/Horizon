import test from 'node:test';import assert from 'node:assert/strict';import {validateModelSettings,engineFor} from '../server/models/engines.ts';
test('LoRA configuration validates adapter paths, weights and backend compatibility',()=>{
 const config={loraAdapters:[{path:'C:/models/tools.gguf',scale:.75,enabled:true}]};assert.deepEqual(validateModelSettings(config),config);
 for(const adapters of [[{path:''}],[{path:'bad\0.gguf'}],[{path:'x.gguf',scale:Infinity}],[{path:'x.gguf',enabled:'true'}],Array.from({length:9},()=>({path:'x.gguf'}))])assert.throws(()=>validateModelSettings({loraAdapters:adapters}));
 assert.equal(engineFor('model.gguf',config),'llama.cpp');assert.throws(()=>engineFor('model-folder',{...config,engine:'mlx'},'darwin','arm64'),/LoRA/);
});
