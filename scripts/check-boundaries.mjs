import {readFile,stat} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
const root=process.cwd();
async function graph(entry,forbidden){const seen=new Set();async function visit(path){if(seen.has(path))return;seen.add(path);const text=await readFile(path,'utf8');for(const match of text.matchAll(/(?:import\s+(?!type\b)[^;]*?from\s*|export\s+[^;]*?from\s*|import\s*\()(['"])(\.[^'"]+)\1/g)){let target=resolve(dirname(path),match[2]);const options=[target,target+'.ts',target+'.tsx',target+'.mjs',resolve(target,'index.ts')];let actual;for(const option of options)try{if((await stat(option)).isFile()){actual=option;break;}}catch{}if(!actual)continue;const name=relative(root,actual).replaceAll('\\','/');if(forbidden.some(pattern=>pattern.test(name)))throw new Error('Web boundary violation: '+relative(root,path)+' imports '+name);await visit(actual);}}await visit(resolve(entry));return seen.size;}
const backend=await graph('server/index.ts',[/^server\/desktop\.ts$/,/^server\/runtime\/native-broker\.ts$/,/^server\/models\/runtime\.ts$/]);
// Native UI uses the #desktop-ui alias. The web target must keep that alias mapped to the web adapter.
const vite=await readFile('vite.config.ts','utf8');if(!vite.includes("'src/platform/web-ui.tsx'"))throw new Error('Web UI adapter mapping is missing');
console.log('Web host boundary: '+backend+' source modules; desktop-only services excluded.');
