import test from 'node:test';
import assert from 'node:assert/strict';
import {registerRuntimeTools} from '../server/runtime/tools.ts';

function documentTools(){
 const definitions=new Map<string,any>();
 registerRuntimeTools({register:(definition:any)=>definitions.set(definition.name,definition)} as any,{});
 return definitions;
}

test('document editing schemas accept scoped file IDs and reject invalid page edits',()=>{
 const tools=documentTools();
 assert.ok(tools.has('pdf_edit'),'PDF editing must be registered');
 assert.ok(tools.has('pdf_inspect'),'PDF inspection must be registered');
 const schema=tools.get('pdf_edit').input;
 assert.equal(schema.safeParse({file_id:'uploaded',output_name:'reviewed',pages:[2,1],rotations:[{page:1,degrees:90}]}).success,true);
 assert.equal(schema.safeParse({file_id:'uploaded',output_name:'reviewed',pages:[0]}).success,false);
 assert.equal(schema.safeParse({file_id:'uploaded',output_name:'reviewed',rotations:[{page:1,degrees:45}]}).success,false);
 assert.equal(schema.safeParse({file_path:'../../private.pdf',output_name:'reviewed'}).success,false);
});

test('spreadsheet edits require bounded addresses and slides preserve the legacy body input',()=>{
 const tools=documentTools();
 assert.ok(tools.has('spreadsheet_edit'),'Spreadsheet editing must be registered');
 const schema=tools.get('spreadsheet_edit').input;
 assert.equal(schema.safeParse({file_id:'uploaded',output_name:'budget',sheets:[{name:'Sales',cells:[{cell:'B2',value:'=A2*2'}]}]}).success,true);
 assert.equal(schema.safeParse({file_id:'uploaded',output_name:'budget',sheets:[{name:'Sales',cells:[{cell:'../../private',value:1}]}]}).success,false);
 const slides=tools.get('slides_create').input;
 assert.equal(slides.safeParse({output_name:'legacy',slides:[{title:'Title',body:'Body'}]}).success,true);
 assert.equal(slides.safeParse({output_name:'rich',theme:{background:'112233'},slides:[{title:'Plan',bullets:['Ship'],notes:'Present clearly'}]}).success,true);
 assert.equal(slides.safeParse({output_name:'bad',slides:[{title:'Bad',bullets:['One'],table:{headers:['A'],rows:[['B']]}}]}).success,false);
});
