import {invoke} from '@tauri-apps/api/core';
import {startDesktopAgent} from './agent';
if('__TAURI_INTERNALS__' in window){
 window.claudeDesktop={
  chooseWorkspace:()=>invoke('workspace_choose'),
  terminalOpen:(workspaceId:string)=>invoke('terminal_open',{workspaceId}),
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
 startDesktopAgent();
}

