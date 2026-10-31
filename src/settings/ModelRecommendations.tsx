import {useEffect,useState} from 'react';
import {api} from '../app/api';
export function ModelRecommendations({onSelect,selected}:{onSelect:(tier:any)=>void;selected?:string}){
 const [hardware,setHardware]=useState<any>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;api('/model-library/hardware').then(value=>{if(active)setHardware(value);}).catch(error=>{if(active)setError(error.message);});return()=>{active=false;};},[]);
 return <section className="model-recommendations" aria-label="Models for your device"><strong>Find Your Fit</strong><p>Choose what matters most. Suggestions use available device memory; speed and quality depend on the model and are not benchmark guarantees.</p>{hardware?<><div className="model-device-info">{hardware.gpus.length?hardware.gpus.map((gpu:any)=>gpu.name+' · '+gpu.freeGiB.toFixed(1)+' GB available').join(', '):hardware.unified?'Apple Silicon · unified memory':hardware.cpu} · {hardware.ramGiB.toFixed(0)} GB RAM</div><div className="model-recommendation-choices">{hardware.tiers.map((tier:any)=><button type="button" key={tier.id} aria-pressed={selected===tier.id} onClick={()=>onSelect(tier)}><strong>{tier.label}</strong><small>{tier.description}</small><small>Up to {tier.maxWeightGiB.toFixed(1)} GiB of estimated weights</small></button>)}</div></>:<p role="status">{error||'Checking your device…'}</p>}</section>;
}
