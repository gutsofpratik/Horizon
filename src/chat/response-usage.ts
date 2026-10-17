export function responseUsage(message:any){
 const usages=(message.rounds??[message]).map((round:any)=>round.usage).filter((usage:any)=>usage&&Number.isFinite(usage.completion_tokens));
 if(!usages.length)return null;
 let processed=0,cached=0,generated=0,promptSeconds=0,generationSeconds=0;
 for(const usage of usages){const reused=Number(usage.prompt_tokens_details?.cached_tokens??0);cached+=reused;processed+=Number(usage.prompt_eval_tokens??Math.max(0,(usage.prompt_tokens??0)-reused));generated+=usage.completion_tokens;promptSeconds+=Number(usage.prompt_eval_seconds??0);generationSeconds+=Number(usage.generation_seconds??0);}
 const latest=usages.at(-1),latestPrompt=Number(latest.prompt_tokens??0),latestCached=Number(latest.prompt_tokens_details?.cached_tokens??0);
 return {rounds:usages.length,latestPrompt,latestCached,latestProcessed:Number(latest.prompt_eval_tokens??Math.max(0,latestPrompt-latestCached)),peakPrompt:Math.max(...usages.map((usage:any)=>Number(usage.prompt_tokens??0))),processed,cached,generated,promptSeconds,generationSeconds,promptSpeed:promptSeconds?processed/promptSeconds:null,generationSpeed:generationSeconds?generated/generationSeconds:null};
}
