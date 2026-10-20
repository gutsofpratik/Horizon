import {readFile,writeFile} from 'node:fs/promises';
import {createPrivateKey,sign} from 'node:crypto';
const input=process.argv[2],output=process.argv[3];
if(!input||!output)throw new Error('Usage: node scripts/release/sign-update.mjs manifest.json signed-update.json');
const pem=process.env.OPENCLAUDE_UPDATE_PRIVATE_KEY;if(!pem)throw new Error('Configure the publisher Ed25519 private key through the release secret store');
const key=createPrivateKey(pem);if(key.asymmetricKeyType!=='ed25519')throw new Error('Expected Ed25519 signing key');
const payload=await readFile(input);JSON.parse(payload.toString('utf8'));
await writeFile(output,JSON.stringify({payload:payload.toString('base64'),signature:sign(null,payload,key).toString('base64')},null,2)+'\n',{mode:0o600});
