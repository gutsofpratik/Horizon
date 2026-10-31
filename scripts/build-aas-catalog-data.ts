import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const root='skills/ecosystem';const manifest=JSON.parse(await readFile(join(root,'catalog.json'),'utf8'));
const index=JSON.parse(await readFile(join(root,'frameworks/aas/skills_index.json'),'utf8'));
const sha=(value:Buffer|string)=>'sha256-'+createHash('sha256').update(value).digest('hex');
const catalog:any[]=[];const lines:Buffer[]=[];let offset=0;
for(const item of index){const pkg=manifest.packages.find((p:any)=>p.sourceId==='agentic-awesome-skills'&&p.sourcePath===item.path+'/SKILL.md');if(!pkg)throw Error('AAS catalog entry has no source package: '+item.id);
 const folder='packages/'+createHash('sha256').update(pkg.id).digest('hex');let ref;
 if(pkg.defaultInstalled&&pkg.license.decision==='allowed'){const text=await readFile(join(root,folder,'SKILL.md'),'utf8');const line=Buffer.from(JSON.stringify({id:item.id,text,sha256:sha(text)})+'\n');ref={assetPath:'frameworks/aas/content.ndjson',offset,length:line.length,sha256:sha(line)};lines.push(line);offset+=line.length;}
 const words=[item.id,item.name,item.description,item.category,...(item.tags??[]),...(item.triggers??[])].join(' ').toLowerCase().match(/[\p{L}\p{N}_-]+/gu)??[];
 catalog.push({id:item.id,name:item.name??item.id,description:item.description??'',category:item.category??'unknown',tags:item.tags??[],triggers:item.triggers??[],searchTokens:[...new Set(words)].sort(),horizonPackageId:pkg.id,untrustedContentPath:folder+'/SKILL.md',untrustedFiles:pkg.files.filter((f:any)=>!/[\\\x00-\x1f:%]/.test(f.path)).map((f:any)=>({path:f.path,type:'file',size:f.bytes,sha256:'sha256-'+f.sha256})).sort((a:any,b:any)=>a.path<b.path?-1:a.path>b.path?1:0),...(ref?{untrustedContentRef:ref}:{})});
}
await mkdir(join(root,'frameworks/aas'),{recursive:true});await writeFile(join(root,'frameworks/aas/content.ndjson'),Buffer.concat(lines));await writeFile(join(root,'frameworks/aas/horizon-catalog.json'),JSON.stringify({version:1,sourceRevision:manifest.sources.find((s:any)=>s.id==='agentic-awesome-skills').revision,skills:catalog})+'\n');console.log(JSON.stringify({metadataEntries:catalog.length,permittedContentRecords:lines.length,originalSkillTextUnchanged:true}));
