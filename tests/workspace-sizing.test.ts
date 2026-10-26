import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workspaceBounds} from '../src/activity/workspace-sizing.ts';
test('workspace sizing reserves room for chat and never exceeds the available width',()=>{
 for(const available of [0,200,500,800,1600]){const {min,max}=workspaceBounds(available);assert.ok(min>=0&&max>=min&&max<=available);if(available>=700)assert.ok(available-max>=400);}
});
