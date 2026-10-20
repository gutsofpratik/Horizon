import type {ChildProcess} from 'node:child_process';
import type {AppContext} from '../app.ts';
/** Registration failure is visible; cleanup never falls back to killing an arbitrary PID. */
export function registerOwnedProcess(app:AppContext,child:ChildProcess,kind:string,executable:string,group=false){
 const supervisor=app.ephemeral.get('processSupervisor');if(!supervisor)return;
 void supervisor.adopt(child,kind,executable,group?child.pid:undefined).catch((error:Error)=>app.ephemeral.set('processRegistrationError',{kind,message:error.message,at:new Date().toISOString()}));
}
