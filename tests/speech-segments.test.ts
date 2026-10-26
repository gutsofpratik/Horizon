import {test} from 'node:test';
import assert from 'node:assert/strict';
import {speechSamples,acceptSpeechResult} from '../src/chat/speech-segments.ts';
test('silence and low-level microphone noise are not sent to transcription',()=>{
 assert.equal(speechSamples(new Float32Array(32000),16000),null);
 assert.equal(speechSamples(new Float32Array(32000).fill(.0004),16000),null);
 const click=new Float32Array(16000);click.fill(.1,0,160);assert.equal(speechSamples(click,16000),null);
});
test('voiced windows retain speech and a little boundary padding',()=>{
 const samples=new Float32Array(48000);for(let i=16000;i<24000;i++)samples[i]=Math.sin(i*.1)*.05;
 const speech=speechSamples(samples,16000);assert.ok(speech);assert.equal(speech.length,12800);assert.ok(speech.some(sample=>sample!==0));
});
test('one audio segment is committed once, while an intentional repeated phrase is preserved',()=>{
 const state={text:'',acceptedEnd:0};assert.equal(acceptSpeechResult(state,6,'How are you?'),true);assert.equal(acceptSpeechResult(state,6,'How are you?'),false);assert.equal(state.text,'How are you?');assert.equal(acceptSpeechResult(state,9,'How are you?'),true);assert.equal(state.text,'How are you? How are you?');
});
