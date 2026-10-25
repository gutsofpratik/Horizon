import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {copyFile,mkdir,mkdtemp,rm,access,chmod,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {createApp} from '../helpers/authenticated-app.ts';
import {OFFICECLI_VERSION} from '../../server/runtime/office.ts';

/** Reuse explicitly ready local dependencies: these tests never install packages. */
export async function localFixture(options:{documents?:boolean;office?:boolean}={}){
 const directory=await mkdtemp(join(tmpdir(),'horizon-local-proof-'));
 const app:any=await createApp({dataDirectory:directory,dbPath:':memory:'});
 const context=app.context;
 const ctx:any={app:context,conversationId:'local-proof',runId:'proof',mode:'code',edition:'web',approvalMode:'full',signal:AbortSignal.timeout(240000),emit:()=>{},loadedSkills:new Map()};
 const close=async()=>{await app.close();await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});};
 try{
  if(options.documents){
   const python=resolve(process.env.DOCUMENT_TEST_PYTHON??join('.local','documents','python',process.platform==='win32'?'Scripts/python.exe':'bin/python'));
   try{execFileSync(python,['-I','-c','import reportlab,pypdf,pandas,matplotlib,PIL,pypdfium2'],{windowsHide:true,timeout:30000,stdio:'pipe'});}catch(error){throw new Error('Local PDF/image prerequisites unavailable: set DOCUMENT_TEST_PYTHON to a prepared interpreter with runtime/worker/pdf-requirements.txt installed. No installation was attempted.',{cause:error});}
   const documents=context.ephemeral.get('documentRuntime');Object.defineProperty(documents,'python',{value:python});await documents.prepare();assert.equal(documents.snapshot().docker_required,false);
  }
  if(options.office){
   const office=context.ephemeral.get('officeRuntime');const source=resolve(process.env.OFFICECLI_TEST_BINARY??join('.local','officecli',OFFICECLI_VERSION,office.asset?.[0]??'unsupported-platform'));
   try{await access(source);}catch(error){throw new Error('OfficeCLI prerequisite unavailable: set OFFICECLI_TEST_BINARY to the installed pinned OfficeCLI binary. No download was attempted.',{cause:error});}
   assert.ok(office.asset,'No pinned OfficeCLI binary for this platform');assert.equal(createHash('sha256').update(await readFile(source)).digest('hex'),office.asset[1],'OfficeCLI prerequisite must match the pinned checksum; no download attempted');
   await mkdir(dirname(office.binary),{recursive:true});await copyFile(source,office.binary);await chmod(office.binary,0o700);await office.prepare();assert.equal(office.snapshot().docker_required,false);
  }
  const call=async(name:string,args:any={})=>{const result=await app.tools.execute({id:crypto.randomUUID(),name,arguments:args},ctx);assert.equal(result.status,'succeeded',JSON.stringify(result.error));return result;};
  return {app,context,ctx,call,close,directory};
 }catch(error){await close();throw error;}
}

