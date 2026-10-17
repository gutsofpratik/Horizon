type Job={entry:any;task:()=>Promise<any>;resolve:(value:any)=>void;reject:(error:Error)=>void;signal?:AbortSignal;cleanup:()=>void;notify?:()=>void};
/** Admission control for native inference slots; model switches are exclusive. */
export class ModelBalancer {
 private waiting:Job[]=[];private active=0;private activating=false;private closed=false;
 constructor(private engine:{ready:(entry:any)=>boolean;capacity:()=>number;activate:(entry:any)=>Promise<any>}){}
 snapshot(){return {active:this.active,queued:this.waiting.length,capacity:Math.max(1,this.engine.capacity()),activating:this.activating};}
 run(entry:any,task:()=>Promise<any>,signal?:AbortSignal,notify?:()=>void):Promise<any>{
  if(this.closed)return Promise.reject(new Error('Model runtime closed'));
  if(signal?.aborted)return Promise.reject(new Error('Generation cancelled'));
  if(this.waiting.length>=64)return Promise.reject(new Error('Inference capacity is full; try again after a response finishes'));
  return new Promise((resolve,reject)=>{
   const cancel=()=>{const index=this.waiting.indexOf(job);if(index<0)return;this.waiting.splice(index,1);job.cleanup();reject(new Error('Generation cancelled'));this.pump();};
   const job:Job={entry,task,resolve,reject,signal,cleanup:()=>signal?.removeEventListener('abort',cancel),notify};
   signal?.addEventListener('abort',cancel,{once:true});this.waiting.push(job);
   if(this.activating||this.active>=this.engine.capacity()||this.active&&!this.engine.ready(entry))notify?.();
   this.pump();
  });
 }
 private pump(){
  if(this.activating||this.closed)return;
  while(this.waiting.length){
   const job=this.waiting[0];
   if(!this.engine.ready(job.entry)){
    if(this.active)return;
    this.activating=true;
    void this.engine.activate(job.entry).then(()=>{this.activating=false;this.pump();},error=>{this.activating=false;const index=this.waiting.indexOf(job);if(index>=0){this.waiting.splice(index,1);job.cleanup();job.reject(error);}this.pump();});
    return;
   }
   if(this.active>=Math.max(1,this.engine.capacity()))return;
   this.waiting.shift();job.cleanup();if(job.signal?.aborted){job.reject(new Error('Generation cancelled'));continue;}
   this.active++;
   void Promise.resolve().then(job.task).then(job.resolve,job.reject).finally(()=>{this.active--;this.pump();});
  }
 }
 close(){this.closed=true;for(const job of this.waiting){job.cleanup();job.reject(new Error('Model runtime closed'));}this.waiting=[];}
}
