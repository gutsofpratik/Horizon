import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('native commands have explicit grants for the trusted remote desktop interface',()=>{
 const source=readFileSync('src-tauri/src/main.rs','utf8');
 const commands=source.split('tauri::generate_handler![')[1].split(']')[0].split(',').map(value=>value.trim().split('::').pop()).filter(Boolean) as string[];
 const build=readFileSync('src-tauri/build.rs','utf8');
 const capability=JSON.parse(readFileSync('src-tauri/capabilities/main.json','utf8'));
 for(const command of commands){
  assert.ok(build.includes('"'+command+'"'),command+' is missing from the app command manifest');
  assert.ok(capability.permissions.includes('allow-'+command.replaceAll('_','-')),command+' has no remote permission');
 }
});
