/** Tracks requested coding outcomes using actual saved files and owned job results. */
export class CodingCompletion {
 private expected:string[];private saved=new Set<string>();private jobs=new Map<string,number>();private latestJob?:string;private revision=0;private testsRequested:boolean;private testsDone=false;private repairRead=false;
 constructor(task:string,coding:boolean,existing:string[]=[]){this.saved=new Set(existing);this.expected=coding?[...new Set((task.match(/\b[\w./-]+\.(?:mjs|cjs|jsx?|tsx?|py|rs|go|java|cs|json|ya?ml|toml|md)\b/g)??[]).filter(path=>!['Node.js','Vue.js','Next.js','Nuxt.js','Express.js','React.js','Three.js','Chart.js'].includes(path)).map(path=>path.split(/[\\/]/).at(-1)!))].slice(0,12):[];const explanationOnly=/^\s*(?:explain|describe|teach|what|why|how|tell me)\b/i.test(task)&&!/(?:\b(?:and|then|also)\s+|[.;]\s*)(?:please\s+)?(?:actually\s+)?(?:run|execute)\b/i.test(task);this.testsRequested=coding&&!explanationOnly&&/\b(?:run|execute)\b[\s\S]{0,100}(?:\btests?\b|--test)/i.test(task)&&!/(?:do not|don't|without|no)\s+(?:run(?:ning)?\s+)?tests?/i.test(task);}
 observe(name:string,args:any,result:any){if(result.status!=='succeeded'){if(name==='files_read'&&result.error?.code==='ENOENT'&&typeof args?.path==='string'){const missing=args.path.split(/[\\/]/).at(-1);if(this.expected.includes(missing)){this.saved.delete(missing);this.repairRead=false;}}return;}let changed=false;for(const file of result.files??[])if(typeof file.name==='string'){this.saved.add(file.name);if(/\.(?:mjs|cjs|jsx?|tsx?|py|rs|go|java|cs|json)$/i.test(file.name))changed=true;}if(changed){this.revision++;this.testsDone=false;}const data=result.data??{};const exit=data.exit_code??data.exitCode;const completed=['completed','exited'].includes(data.status)||data.status===undefined;
  const testRun=name==='terminal_run'&&/(?:--test|\b(?:npm(?:\.cmd)?\s+(?:run\s+)?test|pytest|cargo\s+test|go\s+test|dotnet\s+test|vitest)\b)/i.test(args?.command??'');
  if(testRun&&data.job_id){this.jobs.set(data.job_id,this.revision);this.latestJob=data.job_id;this.testsDone=false;}
  const testResult=testRun||name==='code_test'||name==='terminal_read'&&args?.job_id===this.latestJob&&this.jobs.get(args.job_id)===this.revision;
  if(testResult&&completed&&typeof exit==='number'){this.testsDone=exit===0;this.repairRead=exit!==0;}
  if(name==='files_read'&&typeof args?.path==='string')this.repairRead=false;
 }
 missingFiles(){return this.expected.filter(name=>!this.saved.has(name));}
 needsTests(){return this.testsRequested&&!this.testsDone;}
 needsRepairRead(){return this.testsRequested&&this.repairRead;}
}
