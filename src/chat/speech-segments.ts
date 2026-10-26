// Gate short microphone windows before asking a speech model to decode them.
export function speechSamples(samples:Float32Array,rate:number):Float32Array|null{
 const frame=Math.max(1,Math.round(rate*.02));let first=-1,last=0,active=0;
 for(let start=0;start<samples.length;start+=frame){const end=Math.min(samples.length,start+frame);let energy=0;for(let i=start;i<end;i++)energy+=samples[i]*samples[i];if(Math.sqrt(energy/(end-start))>=.004){if(first<0)first=start;last=end;active+=end-start;}}
 if(first<0||active<rate*.1)return null;
 const pad=Math.round(rate*.15);return samples.slice(Math.max(0,first-pad),Math.min(samples.length,last+pad));
}
export function acceptSpeechResult(state:{text:string;acceptedEnd:number},end:number,text:string){
 if(end<=state.acceptedEnd)return false;
 state.acceptedEnd=end;const next=text.trim();if(!next)return false;
 state.text=[state.text,next].filter(Boolean).join(' ');return true;
}
