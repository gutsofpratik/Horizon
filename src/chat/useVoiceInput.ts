import {useEffect,useRef,useState} from 'react';
import {api} from '../app/api';
import {speechSamples,acceptSpeechResult} from './speech-segments';
export function pcmWave(samples:Float32Array,rate:number){
 const buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer);const word=(offset:number,text:string)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};word(0,'RIFF');view.setUint32(4,36+samples.length*2,true);word(8,'WAVE');word(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);word(36,'data');view.setUint32(40,samples.length*2,true);for(let i=0;i<samples.length;i++){const value=Math.max(-1,Math.min(1,samples[i]));view.setInt16(44+i*2,value<0?value*32768:value*32767,true);}return new Blob([buffer],{type:'audio/wav'});
}
export function useVoiceInput({settings,setText,onError,desktop=false}:any){
 const [recording,setRecording]=useState(false),[busy,setBusy]=useState(false),[transcript,setTranscript]=useState(''),[level,setLevel]=useState(0);
 const current=useRef<any>(null),mounted=useRef(true),starting=useRef(false);
 const clean=(state=current.current)=>{if(!state)return;clearTimeout(state.timer);clearInterval(state.interval);state.stream?.getTracks().forEach((track:MediaStreamTrack)=>track.stop());state.node?.disconnect();state.source?.disconnect();void state.context?.close();};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;clean();current.current?.abort?.abort();current.current=null;};},[]);
 const recognize=async(state:any,final=false):Promise<void>=>{
  if(state.pending){await state.pending;if(final)return recognize(state,true);return;}
  const end=state.chunks.length,parts=state.chunks.slice(state.cursor,end) as Float32Array[],length=parts.reduce((sum,part)=>sum+part.length,0);
  if(length<state.rate*(final ? .2 : .8))return;
  const samples=new Float32Array(length);let offset=0;for(const part of parts){samples.set(part,offset);offset+=part.length;}
  const speech=speechSamples(samples,state.rate);if(!speech){state.cursor=end;return;}
  state.pending=(async()=>{const form=new FormData();form.set('file',pcmWave(speech,state.rate),'recording.wav');const result=await api('/voice/transcribe',{method:'POST',body:form,signal:state.abort.signal});if(!mounted.current||current.current!==state)return;state.cursor=end;if(acceptSpeechResult(state,end,String(result.text??'')))setTranscript(state.text);})();
  try{await state.pending;}finally{state.pending=null;}
 };
 const stop=async()=>{const state=current.current;if(!state||state.stopping)return;state.stopping=true;clean(state);setRecording(false);setBusy(true);setLevel(0);try{await recognize(state,true);if(mounted.current&&state.text)setText((previous:string)=>(previous?previous+' ':'')+state.text);}catch(error){if(mounted.current){if(state.text)setText((previous:string)=>(previous?previous+' ':'')+state.text);onError?.((error as Error).message);}}finally{if(current.current===state)current.current=null;if(mounted.current){setBusy(false);setTranscript('');}}};
 const toggle=async()=>{if(busy||starting.current)return;if(recording){await stop();return;}if(settings.voiceMode==='provider'&&!(settings.aiServices?.transcriptionProviderId&&settings.aiServices?.transcriptionModel)){onError?.('Configure the transcription provider you selected in Voice settings.');return;}starting.current=true;
  try{if(desktop&&settings.voiceMode!=='provider'){setBusy(true);await api('/voice/ready',{method:'POST'});if(!mounted.current)return;}if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone access is unavailable in this session.');const stream=await navigator.mediaDevices.getUserMedia({audio:true});if(!mounted.current){stream.getTracks().forEach(track=>track.stop());return;}current.current={stream};const context=new AudioContext({sampleRate:16000});current.current.context=context;await context.resume();if(!mounted.current){clean();return;}const source=context.createMediaStreamSource(stream),node=context.createScriptProcessor(4096,1,1),gain=context.createGain();gain.gain.value=0;const state:any={stream,context,rate:context.sampleRate,source,node,chunks:[],cursor:0,text:'',acceptedEnd:0,pending:null,abort:new AbortController(),stopping:false};current.current=state;
   node.onaudioprocess=event=>{if(current.current!==state||state.stopping)return;const part=new Float32Array(event.inputBuffer.getChannelData(0));state.chunks.push(part);let sum=0;for(const value of part)sum+=value*value;setLevel(Math.min(1,Math.sqrt(sum/part.length)*8));};source.connect(node);node.connect(gain);gain.connect(context.destination);setTranscript('');setRecording(true);state.interval=setInterval(()=>{if(!state.pending&&!state.stopping)void recognize(state).catch(error=>{if(!state.reported&&mounted.current){state.reported=true;onError?.(error.message);}});},1500);state.timer=setTimeout(()=>void stop(),120000);
  }catch(error){clean();current.current=null;onError?.((error as Error).message);}finally{starting.current=false;if(mounted.current)setBusy(false);}
 };
 return {recording,busy,toggle,stop,transcript,level};
}
