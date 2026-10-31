import {parseSource,getOwnerRepo} from './upstream/source-parser.ts';
import type {EcosystemManifest} from './types.ts';
export function sourceImportPreview(manifest:EcosystemManifest,url:string,kind:'skills'|'plugins'){
 const parsedUrl=new URL(url);if(parsedUrl.protocol!=='https:'||parsedUrl.hostname!=='github.com'||parsedUrl.username||parsedUrl.password||parsedUrl.port||parsedUrl.search||parsedUrl.hash)throw Error('Use a public HTTPS GitHub repository or folder');
 const source=parseSource(url),repository=getOwnerRepo(source)?.toLowerCase();const configured=manifest.sources.find(s=>s.repository.toLowerCase()===repository);
 if(!configured)return {supported:false,items:[]};
 if(source.ref&&/^[a-f0-9]{40}$/.test(source.ref)&&source.ref!==configured.revision)throw Error('This commit has not been reviewed; choose the reviewed source revision or import a separate custom package');
 const scope=source.subpath?.replace(/\/SKILL\.md$/i,'').replace(/\/$/,'');
 const entries=kind==='plugins'?(manifest.plugins??[]).filter(p=>p.repository.toLowerCase()===repository&&(!scope||p.sourcePath===scope||p.sourcePath.startsWith(scope+'/'))).map(p=>({id:p.id,name:p.name,description:p.description,available:p.license.decision==='allowed',reason:p.license.reason,sourceRevision:p.revision})):
  manifest.packages.filter(p=>p.repository.toLowerCase()===repository&&!p.duplicateOf&&(!scope||p.sourcePath.startsWith(scope+'/')||p.sourcePath.replace(/\/SKILL.md$/i,'')===scope)).map(p=>({id:p.id,name:p.name,description:p.description,available:p.license.decision==='allowed',reason:p.license.reason,sourceRevision:p.revision}));
 return {supported:true,repository:configured.repository,revision:configured.revision,items:entries,message:'Installation uses this reviewed, pinned revision. Select the packages to install.'};
}
