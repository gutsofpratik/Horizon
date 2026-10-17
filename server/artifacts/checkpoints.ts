import type {AppContext} from '../app.ts';
import type {ToolContext} from '../tools/registry.ts';
export function draftList(app:AppContext,conversationId:string,incognito=false):any[]{
 const items=incognito?[...app.ephemeral.entries()].filter(([key])=>key.startsWith('artifact-draft:')).map(([,value])=>value):app.store.list('artifact_drafts');
 return items.filter(item=>item.conversationId===conversationId&&item.status!=='published');
}
export function readCheckpoint(id:string,ctx:ToolContext):any{return ctx.incognito?ctx.app.ephemeral.get('artifact-draft:'+id):ctx.app.store.get('artifact_drafts',id);}
export function saveCheckpoint(draft:any,ctx:ToolContext):any{if(ctx.incognito){ctx.app.ephemeral.set('artifact-draft:'+draft.id,draft);return draft;}return ctx.app.store.put('artifact_drafts',draft);}
export function settleDrafts(app:AppContext,runId:string,status:string,incognito=false){
 const items=incognito?[...app.ephemeral.entries()].filter(([key])=>key.startsWith('artifact-draft:')).map(([,value])=>value):app.store.list('artifact_drafts');
 for(const draft of items){if(draft.runId!==runId||draft.status==='published')continue;const value={...draft,runId:undefined,status:status==='cancelled'?'cancelled':status==='completed'?'ready':'interrupted'};if(incognito)app.ephemeral.set('artifact-draft:'+draft.id,value);else app.store.put('artifact_drafts',value);}
}
export function recoverDrafts(app:AppContext){for(const draft of app.store.list('artifact_drafts').filter(item=>item.status==='generating'))app.store.put('artifact_drafts',{...draft,runId:undefined,status:'interrupted'});}
export function savedArtifacts(app:AppContext,conversationId:string,incognito=false):any[]{return incognito?[...app.ephemeral.entries()].filter(([key])=>key.startsWith('private-artifact:')).map(([,value])=>value).filter(value=>value.conversationId===conversationId):app.store.list('artifacts').filter(item=>item.conversationId===conversationId);}
export function saveArtifact(artifact:any,ctx:ToolContext):any{if(ctx.incognito){ctx.app.ephemeral.set('private-artifact:'+artifact.id,artifact);return artifact;}return ctx.app.store.put('artifacts',artifact);}
