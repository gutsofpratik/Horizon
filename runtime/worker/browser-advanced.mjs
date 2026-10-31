import {readFile} from 'node:fs/promises';
export const advancedNames=new Set(['browser_scroll_to','browser_wait_for','browser_read_page_scoped','browser_read_diagnostics','browser_run_script','browser_site_tools','browser_site_call']);
const source=await readFile(new URL('./page-advanced.js',import.meta.url),'utf8');
export async function browserAdvanced(tab,name,args){
 if(name==='browser_run_script')args={...args,timeout_ms:args.timeout_ms??30000};
 // Resolve references into an ephemeral page map for the shared page-level driver.
 const key='__openclaude_worker_observation';if(name==='browser_scroll_to'){if(args.snapshot_id!==tab.snapshotId)throw Error('Snapshot is stale; inspect again');const element=tab.refs.get(args.ref);if(!element||!await element.evaluate(element=>element.isConnected))throw Error('Element is stale; inspect again');await element.scrollIntoViewIfNeeded();return {updated:true};}
 const expression=source.replace('__NAME__',JSON.stringify(name)).replace('__KEY__',JSON.stringify(key)).replace('__ARGS__',JSON.stringify(args));
 if(name!=='browser_run_script')return tab.page.evaluate(expression);
 const cdp=await tab.page.context().newCDPSession(tab.page),timeout=args.timeout_ms;let timer,timedOut=false,scriptException=false;
 try{const result=await Promise.race([cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,timeout}),new Promise((_,reject)=>{timer=setTimeout(()=>{timedOut=true;reject(Error('Page script timed out; inspect the page before retrying'));},timeout+100);})]);if(result.exceptionDetails){scriptException=true;const message=result.exceptionDetails.exception?.description??result.exceptionDetails.text;if(/^(?:(?:Error: )?Page script timed out\b|Script execution timed out\.?|Execution was terminated)/i.test(message))timedOut=true;throw Error(message);}return result.result?.value??null;}
 catch(error){if(timedOut||!scriptException){let deadline;try{await Promise.race([cdp.send('Runtime.terminateExecution'),new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('Termination timed out')),1000);})]);}catch{}finally{clearTimeout(deadline);await tab.page.close({runBeforeUnload:false}).catch(()=>{});}}throw Object.assign(Error("Page script execution failed; inspect page state before retrying: "+error.message),{code:"PAGE_SCRIPT_FAILED"});}
 finally{clearTimeout(timer);await cdp.detach().catch(()=>{});}
}
