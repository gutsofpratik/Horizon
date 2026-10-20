import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';

import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';

test('built desktop entry includes the native bridge bootstrap',()=>{
 if(!existsSync('dist-desktop/assets')){const require=createRequire(import.meta.url);execFileSync(process.execPath,[join(dirname(require.resolve('vite/package.json')),'bin/vite.js'),'build'],{env:{...process.env,OPENCLAUDE_EDITION:'desktop'},stdio:'pipe',windowsHide:true});}
 const code=readdirSync('dist-desktop/assets').filter(file=>file.endsWith('.js')).map(file=>readFileSync('dist-desktop/assets/'+file,'utf8')).join('\n');
 assert.ok(code.includes('/api/native/tauri/'),'Desktop build omitted the native agent entry');
 assert.ok(code.includes('native-workspace-changed'));
});
