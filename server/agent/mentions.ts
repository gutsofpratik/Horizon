export function requestedMentions(text:string,skills:{id:string;name:string;installed:boolean;enabled:boolean;available:boolean}[],toolNames:Iterable<string>){
 const source=text.replace(/```[\s\S]*?(?:```|$)/g,'').replace(/`[^`]*`/g,'');
 const tools=new Set(toolNames),requestedTools=new Set<string>(),requestedSkills=new Map<string,string>();
 for(const match of source.matchAll(/(?:^|\s)([/@])(?:"([^"\n]+)"|([^\s/@]+))/g)){
  const name=match[2]??match[3];
  if(match[1]==='/'&&tools.has(name))requestedTools.add(name);
  if(match[1]==='@'||match.index===0&&match[1]==='/'&&!tools.has(name)){
   const skill=skills.find(item=>(item.name===name||item.id===name)&&item.installed&&item.enabled!==false&&item.available);
   if(skill)requestedSkills.set(skill.id,skill.name);
  }
 }
 return {tools:[...requestedTools],skills:[...requestedSkills.keys()]};
}
