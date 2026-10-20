import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const target=process.argv[2];
if(!['desktop','desktop-build','web-host'].includes(target))throw new Error('Unknown component');
const child=spawn(process.execPath,[target.startsWith('desktop')?'scripts/desktop.mjs':'node_modules/tsx/dist/cli.mjs',target==='desktop'?'dev':target==='desktop-build'?'build':'server/index.ts'],{cwd:root,stdio:'inherit',windowsHide:true});
child.on('exit',code=>process.exitCode=code??1);child.on('error',error=>{console.error(error.message);process.exitCode=1;});
