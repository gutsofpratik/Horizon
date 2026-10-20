import {useState} from 'react';

const controls:Record<string,Array<[string,string]>>={
 anthropic:[['anthropic-adaptive','Adaptive thinking'],['anthropic-budget','Thinking token budget']],
 bedrock:[['anthropic-adaptive','Claude adaptive thinking'],['anthropic-budget','Claude thinking token budget']],
 gemini:[['gemini-budget','Thinking token budget'],['gemini-level','Thinking level']],
 vertex:[['gemini-budget','Gemini thinking token budget'],['gemini-level','Gemini thinking level']],
 responses:[['responses-effort','Responses reasoning effort']],azure:[['responses-effort','Responses reasoning effort']],
 openai:[['chat-effort','Chat Completions reasoning effort']],
};
/** The selected model's documented protocol is configured explicitly, never guessed from its name. */
export function ProviderModelOptions({provider,onChange}:any){
 const [selected,setSelected]=useState('');
 const ids=[...new Set<string>(String(provider.modelIdsText??'').split(/[\n,]/).map(id=>id.trim()).filter(Boolean))];
 const id=ids.includes(selected)?selected:ids[0]??'';
 const option=provider.modelOptions?.[id]??{thinkingControl:'provider-default',effort:'medium',fastEffort:'low',supportsDisable:false,omitTemperature:false,includeSummary:false};
 const change=(patch:any)=>onChange({...provider,modelOptions:{...provider.modelOptions,[id]:{...option,...patch}}});
 if(!controls[provider.type])return null;
 const choices=provider.type==='azure'&&provider.azureApi==='chat'?controls.openai:controls[provider.type];
 const levels=option.thinkingControl==='gemini-level'?['minimal','low','medium','high']:option.thinkingControl==='anthropic-adaptive'?['low','medium','high','xhigh']:['none','minimal','low','medium','high','xhigh'];
 return <details className="provider-model-options"><summary>Per-model reasoning controls</summary><p className="form-note">Use the settings documented by the provider for the exact model. Provider defaults send no extra thinking parameters. This configuration does not claim that an unverified model supports them.</p>
 {!ids.length?<p className="form-note">Enter model IDs above to configure their controls.</p>:<>
 <label>Model<select value={id} onChange={event=>setSelected(event.target.value)}>{ids.map(model=><option key={model} value={model}>{model}</option>)}</select></label>
 <label>Thinking protocol<select value={option.thinkingControl} onChange={event=>change({thinkingControl:event.target.value,effort:'medium',fastEffort:'low'})}><option value="provider-default">Provider default</option>{choices.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
 {option.thinkingControl!=='provider-default'&&<>
 {['anthropic-budget','gemini-budget'].includes(option.thinkingControl)?<label>Thinking budget (tokens)<input type="number" min={1024} max={131072} value={option.budgetTokens??2048} onChange={event=>change({budgetTokens:Number(event.target.value)})}/></label>:<><label>Thinking effort<select value={option.effort} onChange={event=>change({effort:event.target.value})}>{levels.map(level=><option key={level}>{level}</option>)}</select></label><label>Fast effort<select value={option.fastEffort} onChange={event=>change({fastEffort:event.target.value})}>{levels.map(level=><option key={level}>{level}</option>)}</select></label></>}
 {['anthropic-adaptive','anthropic-budget','gemini-budget'].includes(option.thinkingControl)&&<label><input type="checkbox" checked={option.supportsDisable} onChange={event=>change({supportsDisable:event.target.checked})}/> This model supports disabling thinking in Fast mode</label>}
 {['gemini-budget','gemini-level','responses-effort'].includes(option.thinkingControl)&&<label><input type="checkbox" checked={option.includeSummary} onChange={event=>change({includeSummary:event.target.checked})}/> Request a reasoning summary when supported</label>}
 </>}
 <label><input type="checkbox" checked={option.omitTemperature} onChange={event=>change({omitTemperature:event.target.checked})}/> Omit temperature for this model</label>
 <label>Image input support<select value={option.vision===undefined?'unknown':String(option.vision)} onChange={event=>change({vision:event.target.value==='unknown'?undefined:event.target.value==='true'})}><option value="unknown">Not configured</option><option value="true">Supported by this model</option><option value="false">Not supported</option></select></label>
 <label>Tool calling support<select value={option.tools===undefined?'unknown':String(option.tools)} onChange={event=>change({tools:event.target.value==='unknown'?undefined:event.target.value==='true'})}><option value="unknown">Not configured</option><option value="true">Supported by this model</option><option value="false">Not supported</option></select></label>
 </>}
 </details>;
}
