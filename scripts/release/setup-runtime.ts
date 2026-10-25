import {DocumentRuntime} from '../../server/runtime/documents.ts';
import {OfficeRuntime} from '../../server/runtime/office.ts';
import {resolve,join} from 'node:path';
import {EngineEnvironment} from '../../server/models/engines.ts';
const root=process.cwd();
process.env.OPENCLAUDE_DATA_DIR??=join(process.env.LOCALAPPDATA??root,'OpenClaude','data');
process.env.OPENCLAUDE_BUNDLED_PYTHON??=resolve('python');
if(!process.argv.includes('--documents-only')){
 const environment=new EngineEnvironment(root);
 const runtime=await environment.ensure('llama.cpp',process.argv.includes('--cpu')?'cpu':'auto');
 console.log('Horizon inference runtime ready: '+runtime);
}
if(!process.argv.includes('--inference-only')){
 const context={root,dataDirectory:process.env.OPENCLAUDE_DATA_DIR,ephemeral:new Map()} as any;
 const office=new OfficeRuntime(context);
 const documents=new DocumentRuntime(context);
 try{
  await office.prepare();console.log('Horizon OfficeCLI runtime ready.');
  await documents.prepare();console.log('Horizon local PDF runtime ready.');
 }finally{await office.close();await documents.close();}
}
