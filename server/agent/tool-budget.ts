/** Defer schemas that cannot fit a small context; discovery remains callable. */
export function budgetTools(tools:any[],context?:number,request='',discovered=new Set<string>()){
 if(!context||context>=16384)return tools;
 const budget=Math.floor(context*3*.32),words=request.toLowerCase().match(/[a-z_]{3,}/g)??[];
 const score=(tool:any)=>['toolkit','discover_tools'].includes(tool.function.name)?10000:discovered.has(tool.function.name)?5000:words.reduce((sum,word)=>sum+(tool.function.name.includes(word)?20:0),0);
 const ranked=tools.map((tool,index)=>({tool,index,score:score(tool)})).sort((a,b)=>b.score-a.score||a.index-b.index);
 let used=2;const selected=new Set<string>();for(const {tool} of ranked){const size=JSON.stringify(tool).length+1;if(used+size<=budget){selected.add(tool.function.name);used+=size;}}
 return tools.filter(tool=>selected.has(tool.function.name));
}
