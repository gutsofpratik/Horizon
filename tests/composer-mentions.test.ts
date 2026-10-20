import test from 'node:test';import assert from 'node:assert/strict';
import {mentionQuery,insertMention} from '../src/chat/mention-query.ts';
import {requestedMentions} from '../server/agent/mentions.ts';
test('autocomplete detects markers at the caret, preserves surrounding text and ignores URLs/email/code',()=>{
 assert.equal(mentionQuery('https://example.com',19),null);assert.equal(mentionQuery('me@example.com',14),null);
 assert.equal(mentionQuery('```\n/foo',8),null);
 const text='Please /web_se then explain';const query=mentionQuery(text,14)!;
 assert.equal(query.kind,'tool');assert.equal(query.query,'web_se');
 assert.equal(insertMention(text,query,'web_search').text,'Please /web_search then explain');
 const skill=mentionQuery('@front',6)!;assert.equal(skill.kind,'skill');assert.equal(insertMention('@front',skill,'frontend-design').text,'@frontend-design ');
});
test('explicit skill mentions load only installed enabled skills and tool mentions only expose known tools',()=>{
 const skills=[{id:'front',name:'frontend-design',installed:true,enabled:true,available:true},{id:'off',name:'disabled',installed:true,enabled:false,available:true},{id:'space',name:'Design guide',installed:true,enabled:true,available:true}];
 assert.deepEqual(requestedMentions('Use @frontend-design and /artifact_create with @disabled /unknown',skills,['artifact_create']),{tools:['artifact_create'],skills:['front']});
 assert.deepEqual(requestedMentions('use @"Design guide"',skills,[]).skills,['space']);
 assert.deepEqual(requestedMentions('me@frontend-design https://artifact_create `@frontend-design`',skills,['artifact_create']),{tools:[],skills:[]});
 assert.deepEqual(requestedMentions('/frontend-design build a page',skills,[]).skills,['front']);
});
