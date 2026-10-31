import {useEffect,useState} from 'react';
import {ArrowLeft,ArrowRight,Download,Library,Search,PlugZap,Check} from 'lucide-react';
import {ModelLibrary} from '#desktop-ui';
import {ModelRecommendations} from '../settings/ModelRecommendations';
import {ModelConnections} from '../settings/ModelConnections';
import {ChoiceSelect} from '../settings/ChoiceSelect';
import {isDesktopEdition} from '../platform/edition';
import {api} from './api';

export function OnboardingModels({options,onSelect,selected,onRefresh,onError}:any){
 const [view,setView]=useState('menu'),[tier,setTier]=useState<any>(null),[models,setModels]=useState<any[]|null>(null),[providers,setProviders]=useState<any[]>([]),[busy,setBusy]=useState('');
 const refresh=async()=>{setProviders(await api('/entities/providers'));await onRefresh();};
 useEffect(()=>{void refresh().catch((error:Error)=>onError(error.message));},[]);
 const open=async(next:string)=>{setView(next);if(next==='import'){setModels(null);try{setModels((await api('/model-library/ollama')).models);}catch(error){setModels([]);onError((error as Error).message);}}};
 const chooseTier=(next:any)=>{setTier(next);setView('search');};
 return <div className="onboarding-model-setup">{view!=='menu'&&<button className="text-action" onClick={()=>setView('menu')}><ArrowLeft size={14}/>Model setup</button>}
 {view==='menu'&&<div className="onboarding-vertical-options">{isDesktopEdition&&<><button onClick={()=>void open('library')}><Library size={22}/><span><strong>Model library</strong><small>Find a model for your device</small></span><ArrowRight size={17}/></button><button onClick={()=>void open('import')}><Download size={22}/><span><strong>Import from Ollama</strong><small>Use models already on this computer</small></span><ArrowRight size={17}/></button></>}<button onClick={()=>void open('provider')}><PlugZap size={22}/><span><strong>Connect your provider</strong><small>Add a local or cloud connection</small></span><ArrowRight size={17}/></button></div>}
 {view==='library'&&<><ModelRecommendations onSelect={chooseTier}/><button className="onboarding-find-own" onClick={()=>{setTier(null);setView('search');}}><Search size={18}/><span>Find It Yourself</span><ArrowRight size={16}/></button></>}
 {view==='search'&&<div className="onboarding-model-panel"><ModelLibrary browseOnly recommendation={tier} onRefresh={refresh} onError={onError}/></div>}
 {view==='provider'&&<ModelConnections inline initialAdd providers={providers} onRefresh={()=>void refresh().catch((error:Error)=>onError(error.message))} onError={onError}/>}
 {view==='import'&&<div className="onboarding-model-panel">{models===null?<p role="status">Finding downloaded models…</p>:models.length===0?<p>No Ollama models were found on this computer.</p>:models.map(model=><div className="onboarding-model-row" key={model.id}><strong>{model.name}</strong><button className="secondary-button" disabled={!!busy||!model.available} onClick={async()=>{setBusy(model.id);try{const imported=await api('/model-library/ollama/import',{method:'POST',body:JSON.stringify({id:model.id})});await refresh();onSelect('builtin|'+imported.id);}catch(error){onError((error as Error).message);}finally{setBusy('');}}}>{busy===model.id?'Importing…':selected==='builtin|'+model.id?<Check size={14}/>:<Download size={14}/>}Import</button></div>)}</div>}
 {options.length>0&&<label className="onboarding-ready-model">Ready to use<ChoiceSelect aria-label="Choose a model" value={selected} onChange={(event:any)=>onSelect(event.target.value)}><option value="">Choose a model</option>{options.map((model:any)=><option key={model.providerId+'|'+model.id} value={model.providerId+'|'+model.id}>{model.name??model.id}</option>)}</ChoiceSelect></label>}
 </div>;
}
