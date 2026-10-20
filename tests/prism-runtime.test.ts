import test from 'node:test';import assert from 'node:assert/strict';
import {validateModelSettings} from '../server/models/engines.ts';
test('Prism is an explicit validated runtime variant without altering context or GPU settings',()=>{
 const config={engine:'llama.cpp',runtimeVariant:'prism',contextTokens:150000,device:'cuda',gpuLayers:-1};
 assert.deepEqual(validateModelSettings(config),config);
 assert.throws(()=>validateModelSettings({runtimeVariant:'arbitrary.dll'}),/runtime variant/);
});
