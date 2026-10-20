import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/storage/database.ts';
import {buildContext} from '../server/agent/context.ts';
test('chat policy remains present with custom preferences and project instructions',()=>{
 const store=new Store(':memory:');
 try {
  store.put('settings',{id:'main',systemPrompt:'Use metric units.',numCtx:8192});
  store.put('projects',{id:'p',instructions:'Explain for a beginner.'});
  store.put('artifacts',{id:'draft',conversationId:'chat',title:'Demo',type:'html',version:2});
  const messages=buildContext({store,root:process.cwd(),dataDirectory:'.',ephemeral:new Map()},{id:'chat',projectId:'p',activeArtifactId:'draft',messages:[{role:'user',content:'Hello'}]});
  const system=messages[0].content;
  assert.match(system,/Conversation style/);
  assert.match(system,/Do not claim to be Anthropic/);
  assert.match(system,/Do not narrate private chain-of-thought/);
  assert.match(system,/Use metric units/);
  assert.match(system,/Explain for a beginner/);
  assert.match(system,/Active artifact:.*draft/);assert.match(system,/Keep the same artifact identity and preview/);
  assert.equal(messages[1].content,'Hello');
 } finally {store.close();}
});
