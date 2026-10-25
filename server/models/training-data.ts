import {z} from 'zod';
import {Store} from '../storage/database.ts';import {createTools} from '../tools/index.ts';
export function trainingExamples(){
 const store=new Store(':memory:');const app:any={store,root:process.cwd(),dataDirectory:'.local',ephemeral:new Map()};const registry=createTools(app);const catalog=[...registry.tools.values()].map(tool=>({name:tool.name,description:tool.description,inputSchema:tool.inputSchema??z.toJSONSchema(tool.input)}));const rows:any[]=[];
 const cases:any[]=[
 ['calculate',(n:number)=>`Calculate ${n+23} times 17 using the calculator.`,(n:number)=>({expression:`${n+23}*17`})],
 ['web_search',(n:number)=>`Search the web for current official documentation about ${['CUDA','PyTorch','React','TypeScript','Python','Rust','SQLite','WebGPU','Tauri','Node.js'][n]}.`,(n:number)=>({query:`${['CUDA','PyTorch','React','TypeScript','Python','Rust','SQLite','WebGPU','Tauri','Node.js'][n]} official documentation`,limit:5,time_range:'any'})],
 ['browser_open_file',(n:number)=>`Open the existing workspace HTML file demo-${n}.html in the embedded browser.`,(n:number)=>({path:`demo-${n}.html`})],
 ['browser_scroll',(n:number)=>`The browser tool returned tab_id tab-${n}. Scroll this tab down 600 pixels.`,(n:number)=>({tab_id:`tab-${n}`,direction:'down',amount:600})],
 ['browser_snapshot',(n:number)=>`The previous snapshot of tab-${n} is stale. Inspect the page again before interacting.`,(n:number)=>({tab_id:`tab-${n}`})],
 ['browser_press',(n:number)=>`The presentation is already open in tab-${n}. Press ArrowRight to show the next slide.`,(n:number)=>({tab_id:`tab-${n}`,key:'ArrowRight'})],
 ['memory_save',(n:number)=>`Remember my preference: I prefer ${['concise answers','metric units','dark themes','Python examples','vegetarian recipes','morning workouts','accessible layouts','plain language','short paragraphs','TypeScript examples'][n]}.`,(n:number)=>({text:`The user prefers ${['concise answers','metric units','dark themes','Python examples','vegetarian recipes','morning workouts','accessible layouts','plain language','short paragraphs','TypeScript examples'][n]}.`,global:true})],
 ['memory_search',(n:number)=>`Check my saved memories for ${['language','food','workout','design','units','goals','writing','schedule','coding','projects'][n]} preferences.`,(n:number)=>({query:['language','food','workout','design','units','goals','writing','schedule','coding','projects'][n]})],
 ['artifact_read',(n:number)=>`Read the existing artifact with id artifact-${n} before editing it.`,(n:number)=>({artifact_id:`artifact-${n}`})],
 ['artifact_update',(n:number)=>`We already read artifact-${n} version 2. Replace its HTML with exactly <h1>Updated ${n}</h1> and keep the same artifact.`,(n:number)=>({artifact_id:`artifact-${n}`,expected_version:2,source:`<h1>Updated ${n}</h1>`})],
 ['artifact_create',(n:number)=>`Save a Markdown artifact titled Checklist ${n} containing exactly: # Checklist ${n}\n- Verify the result`,(n:number)=>({title:`Checklist ${n}`,type:'markdown',source:`# Checklist ${n}\n- Verify the result`})],
 ['files_write',(n:number)=>`Create the new workspace file notes-${n}.txt with exactly the text: Task ${n} is ready`,(n:number)=>({path:`notes-${n}.txt`,text:`Task ${n} is ready`})],
 ['plan_create',(n:number)=>`Create a visible task plan named Project ${n} with these tasks: Inspect inputs; Build output; Verify result.`,(n:number)=>({title:`Project ${n}`,tasks:['Inspect inputs','Build output','Verify result']})],
 ];
 try{
  for(const [name,prompt,argumentsFor] of cases)for(let n=0;n<10;n++){
   const args=registry.tools.get(name)!.input.parse(argumentsFor(n));const tools=[catalog.find(tool=>tool.name===name)!,catalog.find(tool=>tool.name===(name==='calculate'?'files_list':'calculate'))!].map(tool=>({type:'function',function:{name:tool.name,description:tool.description,parameters:tool.inputSchema}}));
   rows.push({id:name+'-'+n,split:n>=8?'evaluation':'train',source:'synthetic-app-workflow',privateChat:false,messages:[{role:'system',content:'You are Horizon. Use only the supplied tools. Return JSON with content and tool_calls [{name, arguments}]. Call tools to perform requested actions; never claim success before a successful tool result. Use observed identifiers exactly. Opening a browser is not scrolling. Keep existing artifact identity when editing. If a snapshot is stale, inspect again. Current tools: '+JSON.stringify(tools)},{role:'user',content:prompt(n)},{role:'assistant',content:JSON.stringify({content:'',tool_calls:[{name,arguments:args}]})}]});
  }
  const social=['Hi','Hello','Hey','hi lol','How are you?','Thanks','Good morning','Hey there','Good evening','Goodbye'];
  for(let n=0;n<social.length;n++)rows.push({id:'social-'+n,split:n>=8?'evaluation':'train',source:'synthetic-app-workflow',privateChat:false,messages:[{role:'system',content:'You are Horizon. Reply naturally and briefly. No tools are enabled for this turn. Do not invent tool access.'},{role:'user',content:social[n]},{role:'assistant',content:n===5?'You are welcome!':n===9?'Goodbye!':'Hello! How can I help?'}]});
  return {train:rows.filter(row=>row.split==='train'),evaluation:rows.filter(row=>row.split==='evaluation')};
 }finally{store.close();}
}
