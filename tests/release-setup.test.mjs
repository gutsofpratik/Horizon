import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('desktop dependency launcher prepares local documents without Docker or model downloads',async()=>{
 const source=await read('scripts/release/package.mjs');
 const launcher=source.split("await writeFile(join(stage,'Setup-Dependencies.cmd'),")[1]?.split(');')[0];
 assert.ok(launcher,'portable dependency launcher exists');
 assert.match(launcher,/-BrowserRuntime -Documents/);
 assert.doesNotMatch(launcher,/-Docker|-Worker|-Inference/);
});
test('installer offers native documents and no Docker installation component',async()=>{
 const source=await read('installer/Horizon.nsi');
 assert.match(source,/Setup-Dependencies\.ps1" -Documents/);
 assert.doesNotMatch(source,/-Docker|-Worker|Section[^\n]*Docker/);
});
test('native document setup prepares OfficeCLI and PDF without inference as a prerequisite',async()=>{
 const source=await read('scripts/release/setup-runtime.ts');
 assert.match(source,/OfficeRuntime/);
 assert.match(source,/--documents-only/);
 const helper=await read('installer/Setup-Dependencies.ps1');
 assert.match(helper,/if\(\$Documents\)/);
 assert.match(helper,/--documents-only/);
 const check=helper.split('if($Check){')[1]?.split('exit 0')[0];
 assert.doesNotMatch(check,/Docker/);
});
