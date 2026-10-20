import {createHash} from 'node:crypto';
import type {AppContext} from '../app.ts';
import type {EngineService} from './service.ts';
import {providerCredential} from '../providers/configuration.ts';
import type {Provider} from '../providers/adapter.ts';
import {resolveProvider} from '../providers/credentials.ts';

/** Link the adopted executor to the same local inference service, not a second loader. */
export async function linkLocalInference(app:AppContext,engine:EngineService,providerId:string,model:string){
 const saved=app.store.get('providers',providerId);if(!saved)throw new Error('Provider connection not found');
 if(!model.trim()||model.length>300)throw new Error('Choose an exact model ID');
 const provider=resolveProvider(app,saved as unknown as Provider);const url=new URL(provider.baseUrl);
 if(!['openai','ollama'].includes(provider.type)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('This link is for the built-in loader, Ollama and local compatible servers only. Cloud provider profiles remain separate.');
 if(url.username||url.password||url.search||url.hash)throw new Error('Invalid local inference endpoint');
 const configured=providerId==='builtin'?app.store.get('local_models',model)?.configuration?.contextTokens:undefined;
 if(providerId==='builtin'&&(!Number.isSafeInteger(configured)||configured<=0))throw new Error('Save the model total context window in its configuration before linking the agent backend. No default was substituted.');
 // Each model keeps its own total context; linking another model cannot overwrite it.
 const id='openclaude-'+createHash('sha256').update(providerId+'\0'+model).digest('hex').slice(0,24);
 const loaded=app.ephemeral.get('modelRuntime')?.loaded;
 const metadata=providerId==='builtin'&&loaded?.modelId===model?{capabilities:loaded.capabilities,capabilitiesKnown:true}:(app.ephemeral.get('providerModels:'+providerId)??[]).find((item:any)=>item.id===model);
 const configuredVision=provider.modelOptions?.[model]?.vision;
 const vision=metadata?.capabilitiesKnown===true?!!metadata.capabilities?.includes('vision'):configuredVision;
 // Upstream requires a nonempty bearer value even for unauthenticated local servers.
 const body={id,platform:'openai',name:(provider.name+' · '+model).slice(0,200),base_url:provider.type==='ollama'?url.href.replace(/\/$/,'')+'/v1':url.href.replace(/\/$/,''),api_key:providerCredential(provider as Provider)||'openclaude-local',models:[model],enabled:true,...(configured?{context_limit:configured}:{}),model_settings:{[model]:{openai_api_mode:'chat_completions',image_input:vision===true?'supported':'unsupported'}}};
 const previous:any=await engine.request('/api/providers');const providers=previous.data??previous;
 const result:any=await engine.request('/api/providers'+(providers.some((item:any)=>item.id===id)?'/'+id:''),providers.some((item:any)=>item.id===id)?'PUT':'POST',body);
 const linked=result.data??result;
 return {providerId:linked.id,model,contextTokens:configured??null,vision:vision??null,visionSource:metadata?.capabilitiesKnown?'runtime':configuredVision!==undefined?'configuration':'unknown',inferenceProviderId:providerId,sharedLoader:true,loadRequested:false,summary:'Linked the existing local inference endpoint. This operation does not load, unload or duplicate model weights.'};
}
