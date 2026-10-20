import {test} from 'node:test';
import assert from 'node:assert/strict';
import {signingConfig,signRelease} from '../scripts/release/signing.mjs';

test('public release signing requires an explicitly selected identity',()=>{
 assert.throws(()=>signingConfig({}),/Signing identity/);
 assert.deepEqual(signingConfig({},true),{mode:'unsigned'});
 assert.throws(()=>signingConfig({OPENCLAUDE_SIGN_CERT_SHA1:'not-a-thumbprint'}),/40 hex/);
});
test('certificate and service modes select one explicit identity',()=>{
 const cert=signingConfig({OPENCLAUDE_SIGN_CERT_SHA1:'A'.repeat(40)});
 assert.equal(cert.thumbprint,'A'.repeat(40));
 const cloud=signingConfig({OPENCLAUDE_SIGN_DLIB:'C:/sign/dlib.dll',OPENCLAUDE_SIGN_METADATA:'C:/sign/profile.json'});
 assert.equal(cloud.dlib,'C:/sign/dlib.dll');
 assert.throws(()=>signingConfig({OPENCLAUDE_SIGN_CERT_SHA1:'A'.repeat(40),OPENCLAUDE_SIGN_DLIB:'x',OPENCLAUDE_SIGN_METADATA:'y'}),/one signing identity/);
 assert.throws(()=>signingConfig({OPENCLAUDE_SIGN_DLIB:'x'}),/both/);
});
test('signing always verifies the signed file and fails closed',async()=>{
 const calls=[];const run=async(command,args)=>{calls.push({command,args});};
 await signRelease('app.exe',{mode:'certificate',thumbprint:'A'.repeat(40)},run);
 assert.match(calls[0].args[4],/Sign-Release.ps1$/);
 assert.deepEqual(calls[0].args.slice(0,4),['-NoLogo','-NoProfile','-NonInteractive','-File']);
 await assert.rejects(signRelease('app.exe',{mode:'certificate',thumbprint:'A'.repeat(40)},async()=>{throw Error('signing failed');}),/signing failed/);
 await signRelease('app.exe',{mode:'unsigned'},()=>{throw Error('should not execute');});
});
