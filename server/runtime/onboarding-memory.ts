/** Convert a reviewed handover into searchable facts; never execute imported content. */
export function parseOnboardingMemories(source:string):string[]{
 const text=source.trim().replace(/^```(?:json)?\s*\n?/i,'').replace(/\n?```$/,'').trim();
 if(!text)return [];
 let facts:any[]=[];
 if(text.startsWith('{')||text.startsWith('[')){
  let parsed:any;try{parsed=JSON.parse(text);}catch{throw new Error('This structured export is incomplete. Paste the full reply or use ordinary text.');}
  const rows=Array.isArray(parsed)?parsed:parsed?.memories;
  if(!Array.isArray(rows))throw new Error('Paste the personal context you want to import.');
  facts=rows.map(item=>typeof item==='string'?item:typeof item?.text==='string'?item.text:null);
  if(facts.some(item=>typeof item!=='string'))throw new Error('Each memory must contain plain text.');
 }else{
  let section='',pending='';
  const flush=()=>{if(pending.trim())facts.push((section?section+': ':'')+pending.trim());pending='';};
  for(const raw of text.split(/\r?\n/)){
   const line=raw.trim();if(!line){flush();continue;}
   if(/^#{1,6}\s+/.test(line)||(/^[^.!?]{1,80}:$/.test(line)&&!/^[-*•\d]/.test(line))||/^\*\*[^*]{1,80}\*\*:?$/.test(line)){flush();section=line.replace(/^#{1,6}\s+/,'').replaceAll('**','').replace(/:$/,'');continue;}
   if(/^\s*(?:[-*•]|\d+[.)])\s+/.test(raw)){flush();pending=line.replace(/^(?:[-*•]|\d+[.)])\s+/,'');}
   else{if(pending)pending+=' ';pending+=line;}
  }flush();
 }
 const chunks:string[]=[];
 for(let fact of [...new Set(facts)]){fact=String(fact).trim();while(fact.length>2000){let cut=fact.lastIndexOf(' ',1900);if(cut<100)cut=1900;chunks.push(fact.slice(0,cut).trim());fact=fact.slice(cut).trim();}if(fact)chunks.push(fact);}
 const unique=chunks;if(unique.length>1000)throw new Error('Import up to 1,000 memories at a time.');return unique;
}
