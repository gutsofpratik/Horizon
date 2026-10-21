import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {registerRemoteRoutes} from '../server/runtime/remote.ts';

test('remote pairing returns a private QR link and only the granted conversation',async()=>{
 const records=new Map<string,any>();const chat={id:'chat-1',title:'Demo',headId:'a',messages:[{id:'u',role:'user',content:'Hello'},{id:'a',role:'assistant',parentId:'u',content:'Hi',reasoning:'not a remote field'}]};
 const store={get:(bucket:string,id:string)=>records.get(bucket+':'+id),put:(bucket:string,row:any)=>{records.set(bucket+':'+row.id,row);return row;},list:(bucket:string)=>[...records].filter(([key])=>key.startsWith(bucket+':')).map(([,value])=>value)};
 const app=Fastify();const agent={conversation:(id:string)=>id===chat.id?chat:undefined,states:new Map()};registerRemoteRoutes(app,{store,ephemeral:new Map([['agent',agent]])} as any,{definitions:()=>[]} as any);
 try{
  assert.equal((await app.inject({method:'POST',url:'/api/remote/configuration',payload:{origin:'http://127.0.0.1:3001'}})).statusCode,500);
  assert.equal((await app.inject({method:'POST',url:'/api/remote/configuration',payload:{origin:'https://private.example'}})).statusCode,200);
  const pairing=(await app.inject({method:'POST',url:'/api/remote/pairings',payload:{conversationId:chat.id,name:'Phone',tools:[]}})).json();assert.match(pairing.qrDataUrl,/^data:image\/png;base64,/);const url=new URL(pairing.pairingUrl);assert.equal(url.origin,'https://private.example');assert.equal(new URLSearchParams(url.hash.slice(1)).get('code'),pairing.code);
  const result=await app.inject({method:'POST',url:'/api/remote/pair',payload:{pairingId:pairing.pairingId,code:pairing.code}});assert.equal(result.statusCode,200);
  assert.equal((await app.inject({method:'POST',url:'/api/remote/pair',payload:{pairingId:pairing.pairingId,code:pairing.code}})).statusCode,500,'pairing is one-use');
  const headers={authorization:'Bearer '+result.json().token};const session=(await app.inject({url:'/api/remote/session',headers})).json();assert.equal(session.conversationId,chat.id);assert.equal(session.messages.length,2);assert.equal(session.messages[1].reasoning,undefined);
  assert.equal((await app.inject({url:'/api/remote/grants',headers})).statusCode,500,'paired devices cannot manage grants');
 }finally{await app.close();}
});
