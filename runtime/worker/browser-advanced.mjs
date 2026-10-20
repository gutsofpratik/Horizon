import {readFile} from 'node:fs/promises';
export const advancedNames=new Set(['browser_scroll_to','browser_wait_for','browser_read_page_scoped','browser_read_diagnostics','browser_run_script','browser_site_tools','browser_site_call']);
const source=await readFile(new URL('./page-advanced.js',import.meta.url),'utf8');
export async function browserAdvanced(tab,name,args){
 // Resolve references into an ephemeral page map for the shared page-level driver.
 const key='__openclaude_worker_observation';if(name==='browser_scroll_to'){if(args.snapshot_id!==tab.snapshotId)throw Error('Snapshot is stale; inspect again');const element=tab.refs.get(args.ref);if(!element||!await element.evaluate(element=>element.isConnected))throw Error('Element is stale; inspect again');await element.scrollIntoViewIfNeeded();return {updated:true};}
 const expression=source.replace('__NAME__',JSON.stringify(name)).replace('__KEY__',JSON.stringify(key)).replace('__ARGS__',JSON.stringify(args));
 if(name!=='browser_run_script')return tab.page.evaluate(expression);
 const cdp=await tab.page.context().newCDPSession(tab.page);let timer;
 try{const result=await Promise.race([cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,timeout:args.timeout_ms}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Page script timed out; inspect the page before retrying')),args.timeout_ms+100);})]);if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return result.result?.value??null;}
 catch(error){let deadline;try{await Promise.race([cdp.send('Runtime.terminateExecution'),new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('Termination timed out')),1000);})]);}catch{}finally{clearTimeout(deadline);await tab.page.close({runBeforeUnload:false}).catch(()=>{});}throw Object.assign(Error("Page script failed or execution timed out; inspect page state before retrying: "+error.message),{code:"PAGE_SCRIPT_FAILED"});}
 finally{clearTimeout(timer);await cdp.detach().catch(()=>{});}
}
