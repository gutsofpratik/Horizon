import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inspectSpeechModel} from '../server/models/speech.ts';
import {pcmWave} from '../src/chat/useVoiceInput.ts';
import {parseOnboardingMemories} from '../server/runtime/onboarding-memory.ts';
test('local speech import accepts standard safetensors and rejects custom model code',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'horizon-speech-'));
 try{await writeFile(join(dir,'config.json'),JSON.stringify({model_type:'whisper'}));await writeFile(join(dir,'model.safetensors'),'fixture');assert.equal((await inspectSpeechModel(dir)).architecture,'whisper');await writeFile(join(dir,'config.json'),JSON.stringify({model_type:'whisper',auto_map:{AutoModel:'untrusted.Model'}}));await assert.rejects(inspectSpeechModel(dir),/Custom model code/);await writeFile(join(dir,'config.json'),JSON.stringify({model_type:'qwen3'}));await assert.rejects(inspectSpeechModel(dir),/speech model/);}finally{await rm(dir,{recursive:true,force:true});}
});
test('microphone encoder produces mono PCM WAV with bounded sample values',async()=>{
 const blob=pcmWave(new Float32Array([-2,0,2]),16000),view=new DataView(await blob.arrayBuffer());assert.equal(blob.type,'audio/wav');assert.equal(view.getUint32(24,true),16000);assert.equal(view.getUint16(22,true),1);assert.equal(view.getUint16(34,true),16);assert.equal(view.getInt16(44,true),-32768);assert.equal(view.getInt16(48,true),32767);
});
test('plain-language memory handover preserves headings and paragraph context',()=>{
 assert.deepEqual(parseOnboardingMemories('# Projects\n- I am building Horizon.\n  It is a desktop app.\n\nPreferences:\n- Keep answers concise.'),['Projects: I am building Horizon. It is a desktop app.','Preferences: Keep answers concise.']);
 const facts=parseOnboardingMemories('x'.repeat(4500));assert.equal(facts.join('').length,4500);assert.ok(facts.every(fact=>fact.length<=2000));
});
