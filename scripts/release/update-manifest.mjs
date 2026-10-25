import {readFile,writeFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash,createPrivateKey,createPublicKey,sign} from 'node:crypto';
import {join} from 'node:path';
import {releaseKey} from './update-key.mjs';
export async function writeUpdateManifest(directory,version){
 const name='Horizon-'+version+'-windows-x64-setup.exe',file=join(directory,name);
 const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);
 const key=createPrivateKey(await releaseKey());
 const trust=JSON.parse(await readFile('runtime/update-trust.json','utf8'));
 if(createPublicKey(key).export({format:'pem',type:'spki'})!==trust.publicKey)throw new Error('Update signing key does not match the bundled public key');
 const payload=Buffer.from(JSON.stringify({schemaVersion:1,version,contractVersion:1,publishedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+365*86400000).toISOString(),notes:'Horizon '+version,assets:[{platform:'win32',arch:'x64',url:'https://github.com/gutsofpratik/Horizon/releases/download/v'+version+'/'+name,sha256:hash.digest('hex'),bytes:(await stat(file)).size,kind:'installer'}]}));
 await writeFile(join(directory,'update.json'),JSON.stringify({payload:payload.toString('base64'),signature:sign(null,payload,key).toString('base64')})+'\n');
}
