import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export function signingConfig(env=process.env,unsigned=false){
 if(unsigned)return {mode:'unsigned'};
 const thumbprint=env.OPENCLAUDE_SIGN_CERT_SHA1;
 const dlib=env.OPENCLAUDE_SIGN_DLIB,metadata=env.OPENCLAUDE_SIGN_METADATA;
 if(dlib||metadata){
  if(!dlib||!metadata)throw Error('Artifact Signing requires both OPENCLAUDE_SIGN_DLIB and OPENCLAUDE_SIGN_METADATA');
  if(thumbprint)throw Error('Select one signing identity: certificate or Artifact Signing');
  return {mode:'service',dlib,metadata};
 }
 if(thumbprint){
  if(!/^[a-f0-9]{40}$/i.test(thumbprint))throw Error('Certificate thumbprint must be 40 hex characters');
  return {mode:'certificate',thumbprint};
 }
 throw Error('Signing identity missing. Configure OPENCLAUDE_SIGN_CERT_SHA1 or Artifact Signing; use --unsigned only for an explicitly unsigned preview.');
}
const defaultRun=(command,args,options)=>new Promise((ok,fail)=>{
 const child=spawn(command,args,{stdio:'inherit',windowsHide:true,...options});
 child.on('error',fail);child.on('exit',code=>code===0?ok():fail(Error('Signing/verification failed: '+code)));
});
export async function signRelease(file,config,run=defaultRun){
 if(config.mode==='unsigned')return;
 await run('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./Sign-Release.ps1',import.meta.url)),'-Path',file],{env:{...process.env,
  OPENCLAUDE_SIGN_CERT_SHA1:config.thumbprint??'',OPENCLAUDE_SIGN_DLIB:config.dlib??'',OPENCLAUDE_SIGN_METADATA:config.metadata??''}});
}
