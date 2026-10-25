import type {ToolRegistry,ToolContext} from './registry.ts';
import {decideTool} from './policy.ts';
import {groupForLeaf,groupAction,isToolGroup} from './groups.ts';
export const requestedCapabilityFamilies={
 browser:['navigate','read_page','get_page_text','find','click','type','key','scroll','scroll_to','wait_for','select_option','hover','screenshot','crop','new_tab','list_tabs','switch_tab','close_tab','read_page_scoped','click_at','drag_path','hold_keys','hover_at','set_checked','read_diagnostics','run_script','upload','download','site_tools','site_call','annotations'],
 computer:['click','pointer','drag','move','scroll','key','type','wait','screenshot','appshot','history','windows','focus_window','open_application'],
 files:['read','write','apply_patch','list','search'],
 retrieval:['index','search'],python:['session'],image:['generate','transform'],
 agent:['spawn','send_message','followup','wait','interrupt','list','status','result','stop'],
 lifecycle:['list','save','delete'],workflow:['record','list','read','replay','install_skill'],template:['create','list','apply'],
} as const;
export function capabilityManifest(registry:ToolRegistry,ctx:ToolContext){
 const settings=ctx.app.store.get('settings','main')??{},families=new Map<string,any[]>();
 for(const tool of registry.tools.values()){
  if(isToolGroup(tool.name)||tool.name==='toolkit'||tool.name==='discover_tools')continue;
  const family=groupForLeaf(tool.name)??tool.name.split('_')[0],decision=decideTool(tool,ctx,settings),unavailable=tool.available?.()??null;
  const actions=families.get(family)??[];actions.push({action:groupAction(tool.name)??tool.name,tool:tool.name,registered:true,available:decision.allowed&&!unavailable,reason:decision.allowed?unavailable:decision.reason,requires:tool.requires??null});families.set(family,actions);
 }
 return [...families].sort(([a],[b])=>a.localeCompare(b)).map(([family,actions])=>({family,actions:actions.sort((a,b)=>a.action.localeCompare(b.action))}));
}
