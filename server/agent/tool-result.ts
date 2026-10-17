import {digest} from '../tools/files.ts';
export function serializeToolResult(result:any){
 // Pixels travel in the provider's image channel, not as base64 token text.
 // Retain screen_id and dimensions so the model can safely act on that image.
 if(result.data?.screenshot?.image){const {image,...screenshot}=result.data.screenshot;result={...result,data:{...result.data,screenshot:{...screenshot,image_attached_separately:true}}};}
 const serialized=JSON.stringify(result);if(serialized.length<=30000)return serialized;
 if(result.tool==='conversation_read'&&typeof result.data?.content==='string'){const content=result.data.content.slice(0,3000);return JSON.stringify({...result,data:{...result.data,content,next_offset:(result.data.offset??0)+content.length,truncated:true},truncated:true});}
 if(result.tool==='artifact_read'&&typeof result.data?.artifact?.source==='string'){const source=result.data.artifact.source.slice(0,3000);const {versions,...artifact}=result.data.artifact;return JSON.stringify({...result,data:{...result.data,artifact:{...artifact,source},next_offset:(result.data.offset??0)+source.length,truncated:(result.data.offset??0)+source.length<result.data.total_characters},artifacts:[],truncated:true});}
 const metadata=(artifact:any)=>{const {source,versions,...rest}=artifact;return {...rest,...(typeof source==='string'?{characters:source.length,source_hash:digest(source)}:{}),versions:versions?.map(({source,...version}:any)=>version)};};
 const {artifact,...data}=result.data??{};const compact={...result,data:{...data,...(artifact?{artifact:metadata(artifact)}:{})},artifacts:(result.artifacts??[]).map(metadata),truncated:true};
 if(JSON.stringify(compact).length<=30000)return JSON.stringify(compact);
 return JSON.stringify({...compact,data:{summary:result.summary,artifact:artifact?metadata(artifact):undefined,draft_id:data.draft_id,revision:data.revision,characters:data.characters,next_offset:data.next_offset,source_hash:data.source_hash,output:'Large result omitted; use bounded file or artifact read tools'}});
}
