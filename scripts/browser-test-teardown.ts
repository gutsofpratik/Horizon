import {rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,sep} from 'node:path';
export default function teardown(){
 const directory=process.env.HORIZON_BROWSER_TEST_DIRECTORY;
 if(directory&&resolve(directory).startsWith(resolve(tmpdir())+sep)&&resolve(directory).split(sep).at(-1)?.startsWith('horizon-browser-tests-'))rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
