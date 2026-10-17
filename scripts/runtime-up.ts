import {execFile} from 'node:child_process';
import {resolve} from 'node:path';
const child=execFile('docker',['compose','-f',resolve('runtime/compose.yml'),'up','-d','--build'],{windowsHide:true,maxBuffer:20*1024*1024},error=>{if(error){console.error(error.message);process.exitCode=1;}});
child.stdout?.pipe(process.stdout);
child.stderr?.pipe(process.stderr);
