import {digest} from '../tools/files.ts';
import type {AppContext} from '../app.ts';
/** Each provider completion is recorded once, regardless of repeated streamed usage events. */
export function recordInferenceRound(app:AppContext,run:any,round:number,details:any){
 const key=run.id+':'+round,previous=app.store.get('inference_rounds',key);if(previous)return previous;
 const schemaHash=digest(JSON.stringify(details.tools??[])),policyHash=digest(String(details.messages?.[0]?.content??'').split('\n\nLive workspace context')[0]);
 const prior=app.ephemeral.get('inferencePrefix:'+run.conversationId);
 const usage=details.usage??{},cached=usage.prompt_tokens_details?.cached_tokens??usage.cached_tokens??usage.cache_read_input_tokens;
 const record={id:key,conversationId:run.conversationId,runId:run.id,round,providerId:run.providerId,model:run.model,workerEpoch:details.runtime?.workerEpoch??null,workerStarts:details.runtime?.workerStarts??null,contextTokens:details.contextTokens,policyHash,schemaHash,compactionRevision:details.compactionRevision??0,inputTokens:usage.prompt_tokens??usage.input_tokens??null,generatedTokens:usage.completion_tokens??usage.output_tokens??null,cachedTokens:cached??null,promptMilliseconds:usage.prompt_ms??usage.timings?.prompt_ms??null,generationMilliseconds:usage.predicted_ms??usage.timings?.predicted_ms??null,cacheCause:!prior?'first-request':prior.model!==run.model?'model-changed':details.runtime?.workerEpoch&&prior.workerEpoch!==details.runtime.workerEpoch?'worker-restarted':prior.schemaHash!==schemaHash?'tool-schema-changed':prior.policyHash!==policyHash?'policy-changed':prior.compactionRevision!==(details.compactionRevision??0)?'conversation-compacted':cached===0?'runtime-reported-miss':cached>0?'runtime-reported-reuse':'runtime-did-not-report-cache',createdAt:new Date().toISOString()};
 if(!run.incognito){app.store.put('inference_rounds',record);app.ephemeral.set('inferencePrefix:'+run.conversationId,{model:run.model,workerEpoch:record.workerEpoch,policyHash,schemaHash,compactionRevision:record.compactionRevision});}return record;
}
