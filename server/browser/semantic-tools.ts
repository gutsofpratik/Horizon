import {z} from 'zod';
import type {ToolRegistry} from '../tools/registry.ts';
import {executeGroupedLeaf} from '../tools/groups.ts';
export function registerSemanticBrowserTools(registry:ToolRegistry){
 const observed={tab_id:z.string(),snapshot_id:z.string(),ref:z.string()};
 const alias=(name:string,target:string,description:string,input:z.ZodType,convert:(args:any)=>any=(args=>args))=>registry.register({name,capability:'conversation',description,input,handler:(args,ctx)=>executeGroupedLeaf(registry,target,convert(args),ctx)});
 registry.register({name:'browser_read_page',capability:'conversation',description:'Read actual browser page text and/or interactive element references. filter=interactive omits body text; filter=all includes both. References belong to the returned snapshot_id.',input:z.object({tab_id:z.string(),filter:z.enum(['all','interactive']).default('all')}).strict(),handler:async(args,ctx)=>{const result=await executeGroupedLeaf(registry,'browser_snapshot',{tab_id:args.tab_id},ctx),snapshot=result.snapshot??result;return {snapshot:args.filter==='interactive'?{...snapshot,text:undefined}:snapshot};}});
 registry.register({name:'browser_get_page_text',capability:'conversation',description:'Return actual page text, title and URL without an interactive element catalog.',input:z.object({tab_id:z.string()}).strict(),handler:async(args,ctx)=>{const result=await executeGroupedLeaf(registry,'browser_snapshot',args,ctx),page=result.snapshot??result;return {tab_id:args.tab_id,url:page.url,title:page.title,text:page.text};}});
 alias('browser_navigate','browser_open','Navigate an owned tab to an HTTP(S) URL; returns observed page state.',z.object({tab_id:z.string(),url:z.string().url()}).strict());
 alias('browser_new_tab','browser_open','Create a browser tab at an HTTP(S) URL.',z.object({url:z.string().url()}).strict());
 alias('browser_list_tabs','browser_tabs','List owned browser tabs.',z.object({}).strict(),()=>({action:'list'}));
 alias('browser_switch_tab','browser_tabs','Select an owned browser tab.',z.object({tab_id:z.string()}).strict(),args=>({action:'select',...args}));
 alias('browser_close_tab','browser_tabs','Close an owned browser tab.',z.object({tab_id:z.string()}).strict(),args=>({action:'close',...args}));
 alias('browser_set_checked','browser_check','Set an observed checkbox/radio checked state.',z.object({...observed,checked:z.boolean()}).strict());
 alias('browser_type','browser_fill','Fill an observed browser field with text.',z.object({...observed,text:z.string().max(20000)}).strict(),({text,...rest})=>({...rest,value:text}));
 alias('browser_key','browser_press','Send a key/chord to a tab or current observed element.',z.object({tab_id:z.string(),key:z.string().min(1).max(80),snapshot_id:z.string().optional(),ref:z.string().optional()}).strict());
}
