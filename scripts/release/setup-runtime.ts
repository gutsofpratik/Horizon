import {DocumentRuntime} from '../../server/runtime/documents.ts';
import {resolve,join} from 'node:path';
import {EngineEnvironment} from '../../server/models/engines.ts';
const root=process.cwd();
process.env.OPENCLAUDE_DATA_DIR??=join(process.env.LOCALAPPDATA??root,'OpenClaude','data');
process.env.OPENCLAUDE_BUNDLED_PYTHON??=resolve('python');
const environment=new EngineEnvironment(root);
const runtime=await environment.ensure('llama.cpp',process.argv.includes('--cpu')?'cpu':'auto');
console.log('Horizon inference runtime ready: '+runtime);

const documents=new DocumentRuntime({root,dataDirectory:process.env.OPENCLAUDE_DATA_DIR,ephemeral:new Map()} as any);
await documents.prepare();console.log('Horizon document runtime ready (no Docker).');
