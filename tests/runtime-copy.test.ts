import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,symlink,lstat,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {copyBundledRuntime} from '../server/models/runtime-copy.ts';
test('bundled runtime junctions are copied as files without recreating privileged symlinks',async()=>{
 const root=await mkdtemp(join(tmpdir(),'horizon-runtime-copy-'));
 try{const source=join(root,'source'),link=join(root,'bundled-python'),target=join(root,'installed');await mkdir(source);await writeFile(join(source,'python-marker'),'runtime');await symlink(source,link,process.platform==='win32'?'junction':'dir');await copyBundledRuntime(link,target);assert.equal((await lstat(target)).isSymbolicLink(),false);assert.equal(await readFile(join(target,'python-marker'),'utf8'),'runtime');}finally{await rm(root,{recursive:true,force:true});}
});
