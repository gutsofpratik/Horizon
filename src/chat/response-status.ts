const activeLabels=['Thinking…','Cooking…','Working…','Putting it together…','Connecting the dots…'];
export function responsePhaseLabel(message:any,workingWithTools=false,toolName?:string,tick=0){
 if(message.status!=='generating')return 'Thought process';
 if(message.engineStage==='loading')return 'Loading model…';
 if(message.engineStage==='compacting')return 'Compacting conversation…';
 if(message.engineStage==='queued')return 'Waiting for previous response…';
 if(workingWithTools&&toolName&&toolName!=='toolkit')return 'Using '+toolName.replaceAll('_',' ')+'…';
 return activeLabels[tick%activeLabels.length];
}
export function prefillProgressLabel(progress:any){
 if(!progress?.promptTokens)return 'Reading the conversation before generating a response…';
 const processed=progress.processedTokens??0,cached=progress.cachedTokens??0,total=progress.promptTokens;
 if(cached>0)return `${Math.max(0,processed-cached).toLocaleString()} / ${Math.max(0,total-cached).toLocaleString()} new tokens · ${cached.toLocaleString()} reused`;
 return `${processed.toLocaleString()} / ${total.toLocaleString()} prompt tokens`;
}
