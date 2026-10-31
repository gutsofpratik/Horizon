import {ToolError,type ToolContext} from '../tools/registry.ts';
import {activeMessages} from '../agent/context.ts';
import {normalizeTaskText} from '../tools/intent-text.ts';
function lastUserIndex(messages:any[]){for(let index=messages.length-1;index>=0;index--)if(messages[index].role==='user')return index;return -1;}
export function canAccessArtifact(artifact:any,ctx:ToolContext):boolean{return !!artifact&&(artifact.conversationId===ctx.conversationId||(!ctx.incognito&&!!ctx.projectId&&artifact.projectId===ctx.projectId));}
export function artifactById(id:string,ctx:ToolContext):any{const artifact=ctx.incognito?ctx.app.ephemeral.get('private-artifact:'+id):ctx.app.store.get('artifacts',id);if(!canAccessArtifact(artifact,ctx))throw new ToolError('ARTIFACT_NOT_FOUND','Artifact not found in this chat or selected project');return artifact;}
export function requestedArtifactRevision(ctx:ToolContext):any{
 const conversation=ctx.app.store.get('conversations',ctx.conversationId)??ctx.app.ephemeral.get(ctx.conversationId);
 if(!conversation?.activeArtifactId)return;
 const branch=activeMessages(conversation),last=lastUserIndex(branch);
 const request=normalizeTaskText(String(branch[last]?.content??''));
 const changes=/\b(?:update|edit|revise|improve|modify|change|add|remove|adjust|rename|retitle)\b/i.test(request)||/\bmake\b.{0,50}\bbetter\b/i.test(request);
 const previousUser=lastUserIndex(branch.slice(0,last));
 const justPublished=branch.slice(previousUser+1,last).some(message=>{if(message.role!=='tool')return false;try{const result=JSON.parse(message.content);return result.status==='succeeded'&&(result.artifacts??[]).some((artifact:any)=>artifact.id===conversation.activeArtifactId);}catch{return false;}});
 const otherTarget=/\b(?:file|folder|directory|project|profile|memory|reminder|schedule|pdf|spreadsheet|excel|slides|presentation|repository|github)\b/i.test(request);
 const explicit=/\b(?:artifacts?|html|roadmap|diagram|preview)\b/i.test(request)||/\b(?:it|that|this)\b/i.test(request)&&justPublished&&!otherTarget;
 const implicit=/^\s*(?:please\s+)?(?:update|edit|revise|improve|modify|change|add|remove|adjust|rename|retitle)\b/i.test(request)&&justPublished&&!otherTarget;
 const revision=changes&&(explicit||implicit)&&!/\b(?:new|another|separate|other)\s+(?:html\s+)?artifacts?\b/i.test(request);
 if(revision)return artifactById(conversation.activeArtifactId,ctx);
}
