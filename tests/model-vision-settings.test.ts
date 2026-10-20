import test from 'node:test';import assert from 'node:assert/strict';import {validateModelSettings} from '../server/models/engines.ts';
test('projector and image-budget controls are accepted without allowing fabricated capability flags',()=>{
 assert.deepEqual(validateModelSettings({visionEnabled:true,visionProjectorPath:'C:/models/mmproj.gguf',imageMaxTokens:2048,contextTokens:150000}),{visionEnabled:true,visionProjectorPath:'C:/models/mmproj.gguf',imageMaxTokens:2048,contextTokens:150000});
 assert.throws(()=>validateModelSettings({capabilities:['vision']}),/detected by the runtime/);
 assert.throws(()=>validateModelSettings({imageMaxTokens:1}),/Invalid imageMaxTokens/);
 assert.throws(()=>validateModelSettings({visionEnabled:'yes'}),/Invalid vision setting/);
});
