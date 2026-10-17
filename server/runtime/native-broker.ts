import {randomUUID,timingSafeEqual} from 'node:crypto';
import {ToolError} from '../tools/registry.ts';
type Command={id:string;name:string;args:any;owner:string;cancelId?:string};
export class NativeBroker {
 private token='';updated=0;capabilities={terminal:false,browser:false};
 private queue:Command[]=[];
 private pending=new Map<string,{resolve:(data:any)=>void;reject:(error:Error)=>void;cleanup:()=>void}>();
 connect(token:string,capabilities:{terminal:boolean;browser:boolean}){
  if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Invalid desktop token');
  if(this.token&&this.token!==token)this.dispose();
  this.token=token;this.updated=Date.now();this.capabilities=capabilities;
 }
 private authenticate(token:string){if(token.length!==this.token.length||!this.token||!timingSafeEqual(Buffer.from(token),Buffer.from(this.token)))throw new Error('Desktop authentication failed');}
 poll(token:string){this.authenticate(token);this.updated=Date.now();return this.queue.splice(0);}
 complete(token:string,id:string,result:{data?:any;error?:string}){
  this.authenticate(token);const pending=this.pending.get(id);if(!pending)throw new Error('Desktop command is not pending');
  this.pending.delete(id);pending.cleanup();result.error?pending.reject(new ToolError(/TERMINAL_EXITED|Terminal (?:process has exited|job has stopped)|pipe is being closed/i.test(result.error)?'TERMINAL_EXITED':'NATIVE_TOOL_FAILED',result.error)):pending.resolve(result.data);
 }
 request(name:string,args:any,owner:string,signal:AbortSignal){
  if(signal.aborted)return Promise.reject(new ToolError('CANCELLED','Desktop command cancelled'));
  const id=randomUUID();return new Promise<any>((resolve,reject)=>{
   const cancel=()=>{if(!this.pending.delete(id))return;cleanup();this.queue=this.queue.filter(item=>item.id!==id);this.queue.push({id:randomUUID(),name:'cancel',args:{},owner,cancelId:id});reject(new ToolError('CANCELLED','Desktop command cancelled'));};
   const timer=setTimeout(()=>{cancel();},45000);timer.unref();
   const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);};
   this.pending.set(id,{resolve,reject,cleanup});signal.addEventListener('abort',cancel,{once:true});this.queue.push({id,name,args,owner});
  });
 }
 dispose(){for(const pending of this.pending.values()){pending.cleanup();pending.reject(new ToolError('NATIVE_UNAVAILABLE','Desktop disconnected'));}this.pending.clear();this.queue=[];this.token='';this.capabilities={terminal:false,browser:false};}
}
export function registerNativeBroker(app:any,context:any){
 app.get('/api/native/status',async()=>{const bridge=context.ephemeral.get('nativeBridge');return {connected:!!bridge&&Date.now()-bridge.updated<12000,terminalGranted:!!bridge?.terminal,computerGranted:!!bridge?.computer,ipcReady:bridge?.ipcReady??null,ipcError:bridge?.ipcError??null};});
 const broker=new NativeBroker();context.ephemeral.set('tauriBroker',broker);app.addHook('onClose',async()=>broker.dispose());
 app.post('/api/native/tauri/connect',async(request:any)=>{const body=request.body;broker.connect(String(body.token??''),{terminal:body.terminal===true,browser:body.browser===true});context.ephemeral.set('nativeBridge',{kind:'tauri',ipcReady:body.ipcReady===true,ipcError:String(body.ipcError??''),computer:body.computer===true,terminal:broker.capabilities.terminal,browser:broker.capabilities.browser,tools:body.computer===true?['computer_screenshot','computer_click','computer_move','computer_drag','computer_scroll','computer_type','computer_key','computer_wait','terminal_run','terminal_read','terminal_stdin','terminal_cancel','browser_open','browser_snapshot','browser_click','browser_fill','browser_scroll','browser_tabs','browser_press','browser_find','browser_print','browser_zoom','browser_emulate_device']:body.browser===true?['terminal_run','terminal_read','terminal_stdin','terminal_cancel','browser_open','browser_snapshot','browser_click','browser_fill','browser_scroll','browser_tabs','browser_press','browser_find','browser_print','browser_zoom','browser_emulate_device']:['terminal_run','terminal_read','terminal_stdin','terminal_cancel'],updated:Date.now()});return {connected:true};});
 const token=(request:any)=>String(request.headers.authorization??'').replace(/^Bearer /,'');
 app.get('/api/native/tauri/commands',async(request:any)=>{const commands=broker.poll(token(request));const bridge=context.ephemeral.get('nativeBridge');if(bridge?.kind==='tauri')bridge.updated=Date.now();return commands;});
 app.post('/api/native/tauri/result',async(request:any)=>{broker.complete(token(request),request.body.id,request.body);return {accepted:true};});
}

