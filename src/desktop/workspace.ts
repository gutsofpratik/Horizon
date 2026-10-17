import {invoke} from '@tauri-apps/api/core';
const workspaces=new Map<string,Promise<DesktopWorkspace>>();
const terminals=new Map<string,Promise<{workspace:DesktopWorkspace;session:any}>>();
export const workspaceScope=(scope?:string)=>scope?encodeURIComponent(scope).replaceAll('%','_'):'default';
export function currentWorkspace(scope?:string){const key=workspaceScope(scope);let pending=workspaces.get(key);if(!pending){pending=invoke<DesktopWorkspace>('workspace_current',{scope:key}).catch(error=>{workspaces.delete(key);throw error;});workspaces.set(key,pending);}return pending;}
export function currentTerminal(scope?:string){const key=workspaceScope(scope);let pending=terminals.get(key);if(!pending){pending=currentWorkspace(scope).then(async workspace=>({workspace,session:await invoke('terminal_open',{workspaceId:workspace.id})})).catch(error=>{terminals.delete(key);throw error;});terminals.set(key,pending);}return pending;}
export function followTerminal(scope:string,id:string){terminals.set(workspaceScope(scope),currentWorkspace(scope).then(workspace=>({workspace,session:{id,status:'running'}})));}
export function clearTerminal(scope?:string){terminals.delete(workspaceScope(scope));}
