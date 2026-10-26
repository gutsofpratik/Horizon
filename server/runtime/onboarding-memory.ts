/** Import user-reviewed facts as data; never interpret them as tool calls or instructions. */
export function parseOnboardingMemories(source:string):string[]{
 const text=source.trim().replace(/^```(?:json)?\s*\n?/i,'').replace(/\n?```$/,'').trim();
 if(!text)return [];
 let facts:unknown;
 if(text.startsWith('{')||text.startsWith('[')){
  let parsed:any;try{parsed=JSON.parse(text);}catch{throw new Error('The memory JSON is incomplete. Paste the full response, or use one fact per line.');}
  facts=Array.isArray(parsed)?parsed:parsed?.memories;
  if(!Array.isArray(facts))throw new Error('Use a JSON list or an object with a memories list.');
 }else facts=text.split(/\r?\n/).map(line=>line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/,'').trim()).filter(Boolean);
 if(!Array.isArray(facts)||facts.length>100)throw new Error('Import up to 100 memories at a time.');
 const cleaned=facts.map(item=>typeof item==='string'?item:typeof item?.text==='string'?item.text:null);
 if(cleaned.some(item=>!item||item.length>2000))throw new Error('Each memory must be plain text between 1 and 2,000 characters.');
 return [...new Set(cleaned.map(item=>item!.trim()).filter(Boolean))];
}
