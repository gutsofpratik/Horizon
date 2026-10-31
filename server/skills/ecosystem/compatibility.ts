import type {Requirement} from './types.ts';
/** Classify instruction transport separately from runtime/service readiness and verification. */
export function assessSkillCompatibility(meta:Record<string,unknown>,body:string,sourceId:string){
 const requirements:Requirement[]=[];
 const openclaw=(meta.metadata as any)?.openclaw;
 for(const id of openclaw?.requires?.env??[])if(typeof id==='string'&&/^[A-Z][A-Z0-9_]{1,100}$/.test(id))requirements.push({kind:'credential',id});
 // Source MCP names cannot be manufactured into registered Horizon functions.
 for(const id of new Set(body.match(/\bmcp__[a-zA-Z0-9_]+\b/g)??[]))requirements.push({kind:'tool',id});
 if(sourceId==='elevenlabs-skills'&&!requirements.some(r=>r.id==='ELEVENLABS_API_KEY'))requirements.push({kind:'credential',id:'ELEVENLABS_API_KEY'});
 if(sourceId==='noizai-skills')requirements.push({kind:'runtime',id:'kokoro-or-noiz'});
 if(sourceId==='remotion-skills')requirements.push({kind:'runtime',id:'remotion'});
 const hostOnly=/\b(?:computer\.use|cua\.getTab|nodeRepl\.emitImage|artifactSession\.|mcpapps)\b/.test(body);
 if(hostOnly)requirements.push({kind:'host',id:'source-host-adapter'});
 return {compatibility:hostOnly?'review-required' as const:'mapped' as const,adapter:hostOnly?undefined:'horizon-native-v1',requirements};
}
