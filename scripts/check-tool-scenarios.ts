import {readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {z} from 'zod';
import Ajv2020 from 'ajv/dist/2020.js';
import {Store} from '../server/storage/database.ts';
import {FileRevisions} from '../server/files/revisions.ts';
import {createTools} from '../server/tools/index.ts';
import {groupForLeaf,isToolGroup} from '../server/tools/groups.ts';
import {checkToolScenarios} from '../server/tools/scenario-coverage.ts';

const option=(name:string)=>{const index=process.argv.indexOf(name);if(index<0)return undefined;if(!process.argv[index+1]||process.argv[index+1].startsWith('--'))throw Error('Missing value for '+name);return process.argv[index+1];};
const manifest=JSON.parse(await readFile(option('--manifest')??'packages/contracts/tool-scenarios.json','utf8'));
if(manifest.version!==1||!Array.isArray(manifest.tools))throw Error('Unsupported tool scenario manifest');
const evidencePath=option('--evidence');
const evidence=evidencePath?(await readFile(evidencePath,'utf8')).split(/\r?\n/).filter(line=>line.trim()).map(line=>JSON.parse(line)):undefined;
const store=new Store(':memory:');
const app:any={root:process.cwd(),dataDirectory:join(tmpdir(),'horizon-catalog-only'),store,ephemeral:new Map(),runtime:{ready:false}};
app.ephemeral.set('fileRevisions',new FileRevisions(app));
try{
 const registry=createTools(app),all=[...registry.tools.values()],ajv=new Ajv2020({strict:false,validateFormats:false});
 const catalog=all.map(tool=>({name:tool.name,schema:tool.inputSchema??z.toJSONSchema(tool.input),...(isToolGroup(tool.name)?{members:all.filter(leaf=>groupForLeaf(leaf.name)===tool.name).map(leaf=>leaf.name)}:{})}));
 for(const tool of catalog)ajv.compile(tool.schema as any);
 const result=checkToolScenarios(catalog,manifest.tools,evidence);
 if(result.errors.length){for(const error of result.errors)console.error(error);process.exitCode=1;}
 console.log(JSON.stringify({...result,evidenceChecked:!!evidence,notice:'Code cases include controlled fixtures. Dependency-blocked tools are not certified; see their linked issues. No tool handlers are executed by this catalog check.'},null,2));
}finally{await app.ephemeral.get('fileRevisions').close();store.close();}
