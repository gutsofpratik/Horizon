import {existsSync} from 'node:fs';
import {dirname,join,basename} from 'node:path';

export function workerExecutable(python:string,platform:string=process.platform){
 if(platform!=='win32')return python;
 // Keep python.exe for pip/setup diagnostics. Only the persistent inference
 // worker needs the GUI-subsystem interpreter, with its stdio explicitly piped.
 if(basename(python).toLowerCase()==='python.exe'){
  const windowless=join(dirname(python),'pythonw.exe');
  if(existsSync(windowless))return windowless;
 }
 return python;
}
