import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import type {AppContext} from '../app.ts';

const prefix='oc:v1:';
function windowsProtect(value:Buffer,decrypt=false){
 const script='Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::'+(decrypt?'Unprotect':'Protect')+'($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser))';
 const result=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input:value.toString('base64'),encoding:'utf8',windowsHide:true,timeout:15000});
 return Buffer.from(result.trim(),'base64');
}
function key(app:AppContext):Buffer{
 const cache=app.ephemeral.get('providerVaultKey');if(cache)return cache;
 const folder=join(app.dataDirectory,'secrets'),file=join(folder,'provider-key');mkdirSync(folder,{recursive:true,mode:0o700});
 let saved:Buffer;try{saved=readFileSync(file);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;const fresh=randomBytes(32),encoded=process.platform==='win32'?windowsProtect(fresh):fresh;try{writeFileSync(file,encoded,{flag:'wx',mode:0o600});saved=encoded;}catch(race){if((race as NodeJS.ErrnoException).code!=='EEXIST')throw race;saved=readFileSync(file);}}
 if(process.platform!=='win32')chmodSync(file,0o600);
 const value=process.platform==='win32'?windowsProtect(saved,true):saved;if(value.length!==32)throw new Error('Provider credential vault is unavailable. Restore its key from your private backup.');app.ephemeral.set('providerVaultKey',value);return value;
}
export function encryptProviderKey(app:AppContext,value:string){if(!value)return '';const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(app),iv);const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return prefix+[iv,cipher.getAuthTag(),data].map(part=>part.toString('base64')).join(':');}
export function resolveProvider<T extends {apiKey?:string}>(app:AppContext,provider:T):T{
 if((provider as any).id==='builtin'){const url=new URL((provider as any).baseUrl);if(url.origin!=='http://127.0.0.1:'+String(process.env.PORT??3001)||url.pathname.replace(/\/$/,'')!=='/api/builtin/v1'||url.username||url.password||url.search||url.hash)throw new Error('The built-in provider must use the owned local inference endpoint');return {...provider,apiKeyEnv:undefined,apiKey:app.ephemeral.get('hostAccess')?.inferenceToken()};}
 if(!provider.apiKey?.startsWith(prefix))return provider;
 try{const [iv,tag,data]=provider.apiKey.slice(prefix.length).split(':').map(part=>Buffer.from(part,'base64'));const cipher=createDecipheriv('aes-256-gcm',key(app),iv);cipher.setAuthTag(tag);return {...provider,apiKey:Buffer.concat([cipher.update(data),cipher.final()]).toString('utf8')};}catch{throw new Error('Cannot unlock this provider credential. Restore the credential vault or re-enter the key.');}
}
export async function protectProvider<T extends {apiKey?:string}>(app:AppContext,entity:T,previous:Partial<T>={}):Promise<T>{return entity.apiKey&&entity.apiKey!==previous.apiKey?{...entity,apiKey:encryptProviderKey(app,entity.apiKey)}:entity;}
export function migrateProviderCredentials(app:AppContext){
 const providers=app.store.list('providers'),pending=providers.filter(provider=>typeof provider.apiKey==='string'&&provider.apiKey&&!provider.apiKey.startsWith(prefix));
 if(!pending.length)return;
 // Preserve a recoverable encrypted snapshot before changing any provider rows.
 // It uses the same private vault key; no plaintext credentials are written to a backup.
 const backup=encryptProviderKey(app,JSON.stringify({version:1,createdAt:new Date().toISOString(),providers}));
 try{writeFileSync(join(app.dataDirectory,'secrets','provider-migration-v1.oc'),backup,{flag:'wx',mode:0o600});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
 for(const provider of pending)app.store.put('providers',{...provider,apiKey:encryptProviderKey(app,provider.apiKey)});
 app.store.put('credential_migrations',{id:'provider-vault-v1',completed:true,backup:'secrets/provider-migration-v1.oc'});
}
