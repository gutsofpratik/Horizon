import JSZip from 'jszip';
import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {AppContext} from '../app.ts';
import {installImportedSkill} from './import-package.ts';
import {installPlugin} from './plugins.ts';
export function githubSource(value:string){
 const url=new URL(value);if(url.protocol!=='https:'||url.hostname!=='github.com'||url.port||url.username||url.password||url.search||url.hash)throw new Error('Use a public https://github.com repository or folder link');
 const parts=url.pathname.split('/').filter(Boolean).map(decodeURIComponent),[owner,rawRepo,view,ref,...folder]=parts,repo=rawRepo?.replace(/\.git$/,'');
 if(!owner||!repo||![owner,repo].every(value=>/^[\w.-]+$/.test(value))||view&&!['tree','blob'].includes(view)||view&&!ref||[ref,...folder].some(part=>part!==undefined&&(part==='.'||part==='..'||/[\\/\0]/.test(part))))throw new Error('Choose a GitHub repository or a branch/folder link');
 return {url:'https://codeload.github.com/'+owner+'/'+repo+'/zip/'+encodeURIComponent(ref??'HEAD'),folder:folder.join('/').replace(/(?:^|\/)(?:SKILL\.md|\.claude-plugin\/plugin\.json)$/i,''),source:url.href};
}
export async function githubPackages(value:string,kind:'skills'|'plugins'){
 const source=githubSource(value),response=await fetch(source.url,{redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!response.ok||!response.body)throw new Error('GitHub download failed: HTTP '+response.status);
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>20*1024*1024)throw new Error('GitHub archive exceeds 20 MiB; import a smaller local package');chunks.push(part.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const archive=await JSZip.loadAsync(Buffer.concat(chunks)),entries=Object.values(archive.files);if(entries.length>10000)throw new Error('Repository has too many files');if(entries.some(entry=>(entry as any).unsafeOriginalName&&(entry as any).unsafeOriginalName!==entry.name||entry.name.includes('\\')||entry.name.includes('\0')))throw new Error('Unsafe repository archive path');
 const root=entries[0]?.name.split('/')[0];if(!root)throw new Error('Repository is empty');
 const scope=root+'/'+(source.folder?source.folder.replace(/\/$/,'')+'/':'');
 const marker=kind==='skills'?/(?:^|\/)SKILL\.md$/i:/\.claude-plugin\/plugin\.json$/i;
 const manifests=entries.filter(entry=>!entry.dir&&entry.name.startsWith(scope)&&marker.test(entry.name));
 if(!manifests.length)throw new Error('No '+(kind==='skills'?'SKILL.md':'.claude-plugin/plugin.json')+' found in this folder');
 if(manifests.length>40||kind==='plugins'&&manifests.length>1)throw new Error('Choose a folder containing '+(kind==='plugins'?'one plugin':'at most 40 skills'));
 let expanded=0;const packages:Buffer[]=[];
 for(const manifest of manifests){const prefix=manifest.name.slice(0,-(kind==='skills'?8:26)),zip=new JSZip();for(const entry of entries){if(entry.dir||!entry.name.startsWith(prefix))continue;const path=entry.name.slice(prefix.length);if(!path||path.startsWith('/')||path.split('/').includes('..')||path.includes('\\')||(Number(entry.unixPermissions)&0o170000)===0o120000)throw new Error('Unsafe package path');const bytes=Number((entry as any)._data?.uncompressedSize??0);expanded+=bytes;if(bytes>10*1024*1024||expanded>20*1024*1024)throw new Error('Expanded import exceeds 20 MiB');zip.file(path,await entry.async('nodebuffer'));}packages.push(await zip.generateAsync({type:'nodebuffer'}));}
 return {packages,source:source.source};
}
export function registerGithubImports(app:FastifyInstance,context:AppContext){
 for(const kind of ['skills','plugins'] as const)app.post('/api/'+kind+'/import/github',async request=>{const {url}=z.object({url:z.string().url().max(2000)}).strict().parse(request.body);const {packages,source}=await githubPackages(url,kind),installed=[];for(const bytes of packages){const item=kind==='skills'?await installImportedSkill(context,bytes,'github-skill.zip'):await installPlugin(context,bytes);installed.push(item);context.store.put(kind,{...item,sourceUrl:source});}return {installed};});
 app.post('/api/plugins/custom',async request=>{const body=z.object({name:z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),description:z.string().min(1).max(2000),instructions:z.string().min(1).max(100000)}).strict().parse(request.body);const zip=new JSZip();zip.file('.claude-plugin/plugin.json',JSON.stringify({name:body.name,description:body.description,version:'1.0.0'}));zip.file('skills/'+body.name+'/SKILL.md','---\nname: '+JSON.stringify(body.name)+'\ndescription: '+JSON.stringify(body.description)+'\n---\n\n'+body.instructions);return installPlugin(context,await zip.generateAsync({type:'nodebuffer'}));});
}
