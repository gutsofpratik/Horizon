import {ToolError,type ToolContext} from '../tools/registry.ts';
export function canAccessArtifact(artifact:any,ctx:ToolContext):boolean{return !!artifact&&(artifact.conversationId===ctx.conversationId||(!ctx.incognito&&!!ctx.projectId&&artifact.projectId===ctx.projectId));}
export function artifactById(id:string,ctx:ToolContext):any{const artifact=ctx.incognito?ctx.app.ephemeral.get('private-artifact:'+id):ctx.app.store.get('artifacts',id);if(!canAccessArtifact(artifact,ctx))throw new ToolError('ARTIFACT_NOT_FOUND','Artifact not found in this chat or selected project');return artifact;}
