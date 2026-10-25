import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseTarget} from '../scripts/release/build-paths.mjs';
test('Windows GNU release outputs stay outside a checkout containing spaces',()=>{
 assert.equal(releaseTarget('C:\\Users\\Name\\My Project',{PUBLIC:'C:\\Users\\Public'},'win32'),'C:\\Users\\Public\\HorizonReleaseTarget');
 assert.throws(()=>releaseTarget('C:\\My Project',{CARGO_TARGET_DIR:'.local/target'},'win32'),/without spaces/);
 assert.equal(releaseTarget('/build/horizon',{},'linux'),'/build/horizon/.local/release-target');
});
