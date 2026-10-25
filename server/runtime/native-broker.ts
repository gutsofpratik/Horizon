import {randomUUID,timingSafeEqual} from 'node:crypto';
import {ToolError} from '../tools/registry.ts';
type Command={id:string;name:string;args:any;owner:string;cancelId?:string};
const legacyBrowser=['browser_open','browser_snapshot','browser_click','browser_fill','browser_scroll','browser_tabs','browser_press','browser_find','browser_print','browser_zoom','browser_emulate_device'];
const knownBrowser=new Set([...legacyBrowser,'browser_scroll_to','browser_wait_for','browser_read_page_scoped','browser_click_at','browser_drag_path','browser_hold_keys','browser_hover_at','browser_read_diagnostics','browser_run_script','browser_crop','browser_site_tools','browser_site_call','browser_back','browser_forward','browser_reload','browser_select_option','browser_check','browser_inspect_element','browser_wait_for_element','browser_hover','browser_double_click','browser_upload','browser_screenshot','browser_download','browser_downloads']);
const legacyComputer=['computer_screenshot','computer_click','computer_move','computer_drag','computer_scroll','computer_type','computer_key','computer_wait'];
const knownComputer=new Set([...legacyComputer,'computer_appshot','computer_pointer','computer_windows','computer_focus_window','computer_open_application','computer_clipboard_read','computer_clipboard_write','computer_window_move','computer_window_resize','computer_window_close','computer_ui_tree','computer_ui_element_action']);
export function advertisedNativeTools(body:any){const browser=body.browser===true?(Array.isArray(body.browserTools)?body.browserTools.filter((name:unknown)=>typeof name==='string'&&knownBrowser.has(name)):legacyBrowser):[];const computer=body.computer===true?(Array.isArray(body.computerTools)?body.computerTools.filter((name:unknown)=>typeof name==='string'&&knownComputer.has(name)):legacyComputer):[];return [...(body.terminal===true?['terminal_run','terminal_read','terminal_stdin','terminal_cancel','terminal_session','terminal_resize']:[]),...browser,...computer];}
export class NativeBroker {
 private token='';updated=0;capabilities={terminal:false,browser:false};
 private queue:Command[]=[];
 private pending=new Map<string,{resolve:(data:any)=>void;reject:(error:Error)=>void;cleanup:()=>void;dispatched:boolean;name:string}>();
 connect(token:string,capabilities:{terminal:boolean;browser:boolean}){
  if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Invalid desktop token');
  if(this.token&&this.token!==token)this.dispose();
  this.token=token;this.updated=Date.now();this.capabilities=capabilities;
 }
 private authenticate(token:string){if(token.length!==this.token.length||!this.token||!timingSafeEqual(Buffer.from(token),Buffer.from(this.token)))throw new Error('Desktop authentication failed');}
 verify(token:string){this.authenticate(token);}
 poll(token:string){this.authenticate(token);this.updated=Date.now();const batch=this.queue.splice(0);for(const command of batch){const pending=this.pending.get(command.id);if(pending)pending.dispatched=true;}return batch;}
 complete(token:string,id:string,result:{data?:any;error?:string}){
  this.authenticate(token);const pending=this.pending.get(id);if(!pending)throw new Error('Desktop command is not pending');
  this.pending.delete(id);pending.cleanup();if(result.error){const stale=/screenshot is stale|snapshot is stale|stale screen|screen_id.*stale/i.test(result.error);const terminal=/TERMINAL_EXITED|Terminal (?:process has exited|job has stopped)|pipe is being closed/i.test(result.error);pending.reject(new ToolError(stale?'STALE_ELEMENT_REFERENCE':terminal?'TERMINAL_EXITED':'NATIVE_TOOL_FAILED',stale?`${result.error}. Capture a fresh screenshot or browser snapshot, then retry with its new reference.`:result.error));}else pending.resolve(result.data);
 }
 request(name:string,args:any,owner:string,signal:AbortSignal){
  if(signal.aborted)return Promise.reject(new ToolError('CANCELLED','Desktop command cancelled before dispatch'));
  const id=randomUUID();return new Promise<any>((resolve,reject)=>{
   const cancel=()=>{const pending=this.pending.get(id);if(!this.pending.delete(id))return;cleanup();this.queue=this.queue.filter(item=>item.id!==id);this.queue.push({id:randomUUID(),name:'cancel',args:{},owner,cancelId:id});const readOnly=!(name==='browser_tabs'&&args.action==='close')&&/^(?:browser_(?:snapshot|screenshot|tabs|find|read_|inspect_)|computer_(?:screenshot|appshot|pointer|windows|wait|clipboard_read|ui_tree)|terminal_read)/.test(name);reject(new ToolError(pending?.dispatched&&!readOnly?'OUTCOME_UNKNOWN':'CANCELLED',pending?.dispatched&&!readOnly?'Desktop action was dispatched, then cancelled or timed out. Its outcome is unknown; inspect state before retrying.':'Desktop command cancelled'));};
   const timer=setTimeout(()=>{cancel();},45000);timer.unref();
   const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);};
   this.pending.set(id,{resolve,reject,cleanup,dispatched:false,name});signal.addEventListener('abort',cancel,{once:true});this.queue.push({id,name,args,owner});
  });
 }
 dispose(){for(const pending of this.pending.values()){pending.cleanup();pending.reject(new ToolError('NATIVE_UNAVAILABLE','Desktop disconnected'));}this.pending.clear();this.queue=[];this.token='';this.capabilities={terminal:false,browser:false};}
}
export function registerNativeBroker(app:any,context:any){
 app.get('/api/native/status',async()=>{const bridge=context.ephemeral.get('nativeBridge');return {connected:!!bridge&&Date.now()-bridge.updated<12000,terminalGranted:!!bridge?.terminal,computerGranted:!!bridge?.computer,ipcReady:bridge?.ipcReady??null,ipcError:bridge?.ipcError??null};});
 const broker=new NativeBroker();context.ephemeral.set('tauriBroker',broker);app.addHook('onClose',async()=>broker.dispose());
 app.post('/api/native/tauri/connect',async(request:any)=>{const body=request.body;broker.connect(String(body.token??''),{terminal:body.terminal===true,browser:body.browser===true});context.ephemeral.set('nativeBridge',{kind:'tauri',platform:String(body.platform??'').slice(0,80),shell:body.shell==='posix'?'posix':'powershell',ipcReady:body.ipcReady===true,ipcError:String(body.ipcError??''),computer:body.computer===true,terminal:broker.capabilities.terminal,browser:broker.capabilities.browser,tools:advertisedNativeTools(body),updated:Date.now()});return {connected:true};});
 const token=(request:any)=>String(request.headers.authorization??'').replace(/^Bearer /,'');
 app.post('/api/native/tauri/processes',async(request:any)=>{broker.verify(token(request));if(process.env.OPENCLAUDE_DESKTOP_OWNED!=='1')return {registered:false,reason:'Process ownership registration requires an app-owned backend'};const pids=request.body?.pids;if(!Array.isArray(pids)||pids.length>32||pids.some(pid=>!Number.isSafeInteger(pid)||pid<=0))throw new Error('Expected at most 32 native process IDs');for(const pid of pids)await context.ephemeral.get('processSupervisor').registerNative(pid,process.ppid);return {registered:true};});
 app.get('/api/native/tauri/commands',async(request:any)=>{const commands=broker.poll(token(request));const bridge=context.ephemeral.get('nativeBridge');if(bridge?.kind==='tauri')bridge.updated=Date.now();return commands;});
 app.post('/api/native/tauri/result',async(request:any)=>{broker.complete(token(request),request.body.id,request.body);return {accepted:true};});
}

