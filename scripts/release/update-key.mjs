import {generateKeyPairSync,createPrivateKey,createPublicKey} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
const directory=join(process.env.LOCALAPPDATA??homedir(),'HorizonPublisher');
const vault=join(directory,'update-signing-key.dpapi');
function protect(value,decrypt=false){
 if(process.platform!=='win32')throw new Error('Use OPENCLAUDE_UPDATE_PRIVATE_KEY on non-Windows release hosts');
 const source=decrypt?'[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String([Console]::In.ReadToEnd()),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))':'[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd()),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))';
 const result=spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command','Add-Type -AssemblyName System.Security; '+source],{input:value,encoding:'utf8',windowsHide:true});
 if(result.status!==0)throw new Error('Windows signing-key vault failed');
 return result.stdout.trim();
}
export async function releaseKey(){
 if(process.env.OPENCLAUDE_UPDATE_PRIVATE_KEY)return process.env.OPENCLAUDE_UPDATE_PRIVATE_KEY;
 return protect(await readFile(vault,'utf8'),true);
}
if(process.argv.includes('--setup')){
 await mkdir(directory,{recursive:true});let pem;
 try{pem=await releaseKey();}catch(error){if(error.code!=='ENOENT')throw error;pem=generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'});await writeFile(vault,protect(pem),{flag:'wx',mode:0o600});}
 const publicKey=createPublicKey(createPrivateKey(pem)).export({type:'spki',format:'pem'});
 await writeFile('runtime/update-trust.json',JSON.stringify({schemaVersion:1,publicKey,endpoint:'https://github.com/gutsofpratik/Horizon/releases/latest/download/update.json'},null,2)+'\n');
 if(process.argv.includes('--github')){
  const result=spawnSync('gh',['secret','set','OPENCLAUDE_UPDATE_PRIVATE_KEY','--repo','gutsofpratik/Horizon'],{input:pem,encoding:'utf8',windowsHide:true});
  if(result.status!==0)throw new Error('Could not save the release signing secret in GitHub');
 }
 console.log('Update trust configured. Private key stored in the Windows protected publisher vault.');
}
