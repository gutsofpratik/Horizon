import type {BackendDescriptor,BackendLifecycle,BackendSessionDescriptor} from '../../packages/contracts/src/index.ts';
import {publicDiagnostic,publicCommandArguments} from './diagnostics.ts';

export function backendLifecycle(row:any):BackendLifecycle{
 const installed=!!(row.installed??row.available);
 const declared=row.authentication?.status??row.auth_status;
 const authenticated:BackendLifecycle['authenticated']=declared==='authenticated'?'yes':declared==='required'||declared==='failed'?'no':declared==='not-required'?'not-required':'unknown';
 const online=(row.last_check_status??row.status)==='online';
 return {listed:true,installed,authenticated,ready:installed&&online&&row.enabled!==false&&authenticated!=='no',verified:false,checkedAt:row.last_check_at,reason:row.last_check_error_message??(!installed?'The agent executable has not been detected.':!online?'The agent has not completed a successful connection check.':undefined)};
}

/** Keep backend declarations intact; host/model/policy limits stay separate. */
export function backendDescriptor(row:any,host:BackendDescriptor['host'],permissions:BackendDescriptor['permissions'],model?:BackendDescriptor['model']):BackendDescriptor{
 const raw=row.handshake??{},lifecycle=backendLifecycle(row);
 return {id:row.id,version:row.agent_source_info?.version??'unknown',transport:row.agent_type==='aionrs'?'embedded':row.agent_type==='acp'?'acp':row.agent_type==='remote'?'remote':'direct-cli',handshake:{models:row.available_models??raw.available_models,modes:row.available_modes??raw.available_modes,commands:row.available_commands??raw.available_commands,configuration:row.config_options??raw.config_options,authentication:row.auth_methods??raw.auth_methods,sessionCapabilities:row.agent_capabilities??raw.agent_capabilities},host,model,permissions,health:{status:lifecycle.ready?'ready':lifecycle.authenticated==='yes'?'authenticated':lifecycle.installed?'installed':'listed',reason:publicDiagnostic(lifecycle.reason)}};
}
export function publicAgent(row:any):any{
 const {env,env_override,api_key,apiKey,token,secret,...safe}=row;
 return {...publicDiagnostic(safe),...(row.args?{args:publicCommandArguments(row.args)}:{}),lifecycle:publicDiagnostic(backendLifecycle(row)),...(row.agent_type==='aionrs'?{name:'OpenClaude engine',upstreamName:row.name}:{}),...(env?{env:env.map((item:any)=>({name:item.name,description:item.description,configured:!!item.value}))}:{}),...(env_override?{env_override:env_override.map((item:any)=>({name:item.name,configured:!!item.value}))}:{})};
}

/** Session reports augment their backend contract; they never replace host/policy/model layers. */
export function sessionDescriptor(backendId:string,snapshot:any):BackendSessionDescriptor{
 const handshake=snapshot.handshake??snapshot.agent_capabilities??{};
 return {id:snapshot.session_id??snapshot.id,backendId,adapterId:snapshot.adapter_id??backendId,connected:!!snapshot.runtime?.has_task,handshake:{models:snapshot.available_models??handshake.available_models,modes:snapshot.available_modes??handshake.available_modes,commands:snapshot.available_commands??handshake.available_commands,configuration:snapshot.config_options??handshake.config_options,authentication:snapshot.auth_methods??handshake.auth_methods,sessionCapabilities:handshake.agent_capabilities??snapshot.session_capabilities??handshake},currentModel:snapshot.current_model_id,currentMode:snapshot.current_mode_id,raw:publicDiagnostic(snapshot)};
}
