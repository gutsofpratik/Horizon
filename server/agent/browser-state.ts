export function lastBrowserObservation(messages:any[]){
 for(let index=messages.length-1;index>=0;index--){const message=messages[index];if(message.role!=='tool'||!message.tool_name?.startsWith('browser_'))continue;try{const result=JSON.parse(message.content);if(result.status!=='succeeded')continue;const snapshot=result.data?.snapshot??result.data;if(snapshot?.tab_id&&snapshot?.snapshot_id)return {tab_id:snapshot.tab_id,snapshot_id:snapshot.snapshot_id,url:snapshot.url,title:snapshot.title,visibleText:String(snapshot.text??'').slice(0,1200),visibleControls:Array.isArray(snapshot.elements)?snapshot.elements.length:undefined};}catch{}}
 return null;
}
export function printedToolCall(text:string,names:Iterable<string>){
 if(!/(?:Tool calls?\s*:|```(?:json)?|"function"\s*:)/i.test(text)||!/"arguments"\s*:/.test(text))return false;
 const registered=new Set(names);return [...text.matchAll(/"name"\s*:\s*"([a-zA-Z0-9_:-]+)"/g)].some(match=>registered.has(match[1]));
}
