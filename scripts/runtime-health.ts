import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
try {
  const {stdout}=await execute('docker',['info','--format','{{.ServerVersion}}'],{timeout:5000,windowsHide:true});
  console.log('Docker ready: '+stdout.trim());
  await execute('docker',['image','inspect','claude-local-worker:0.1'],{timeout:5000,windowsHide:true});
  console.log('Worker image ready');
}catch(error){console.error('Runtime unavailable: '+((error as any).stderr||(error as Error).message));process.exitCode=1;}
