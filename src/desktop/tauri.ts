import {invoke} from '@tauri-apps/api/core';
import {startDesktopAgent,registerTerminalProcess} from './agent';
export const desktopReady=(async()=>{if('__TAURI_INTERNALS__' in window){const credential=await invoke<string>('host_credential');const response=await fetch('/api/session',{method:'POST',headers:{Authorization:'Bearer '+credential}});if(!response.ok)throw new Error('Horizon desktop authentication failed');
 window.claudeDesktop={backgroundMode:(enabled?:boolean)=>invoke('background_mode',{enabled}),browserBackend:/^Win/i.test(navigator.platform)?'native':'chromium',
  chooseWorkspace:()=>invoke('workspace_choose'),
  terminalOpen:async(workspaceId:string)=>{const result:any=await invoke('terminal_open',{workspaceId});await registerTerminalProcess(result.pid);return result;},
  terminalRead:(id:string,offset:number)=>invoke('terminal_read',{id,offset}),
  terminalWrite:(id:string,text:string)=>invoke('terminal_write',{id,text}),
  terminalResize:(id:string,cols:number,rows:number)=>invoke('terminal_resize',{id,cols,rows}),
  terminalClose:(id:string)=>invoke('terminal_close',{id}),
  browserOpen:(url:string,owner?:string)=>invoke('browser_open',{url,owner}),
  browserNavigate:(url:string,owner?:string)=>invoke('browser_navigate',{url,owner}),
  browserState:()=>invoke('browser_status'),
  browserSelect:(id:string)=>invoke('browser_select',{id}),
  browserClose:(id:string)=>invoke('browser_close',{id}),
  browserAction:(action:string)=>invoke('browser_action',{action}),
  browserManage:(action:string,args:any={})=>invoke('browser_manage',{action,args}),
  browserBounds:(bounds:{x:number;y:number;width:number;height:number})=>invoke('browser_bounds',bounds),
 };
 const saved=await fetch('/api/entities/settings/main',{signal:AbortSignal.timeout(5000)}).then(response=>response.ok?response.json():null).catch(()=>null);if(saved?.backgroundMode!==false)await invoke('background_mode',{enabled:true}).catch(()=>{});
 startDesktopAgent();
}})();

