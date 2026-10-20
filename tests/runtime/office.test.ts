import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import JSZip from 'jszip';
import {OfficeRuntime,spreadsheetBatch,documentBatch,slideBatch,OFFICECLI_VERSION} from '../../server/runtime/office.ts';
import {DocumentRuntime} from '../../server/runtime/documents.ts';

test('Office typed adapters use documented batch fields and preserve explicit cell types',()=>{
 const ops=spreadsheetBatch([{name:'Data',rows:[['007',3,true,null,'=SUM(B1:B2)']]}],true);
 assert.deepEqual(ops[1],{command:'set',path:'/Data/A1',props:{value:'007',type:'string'}});
 assert.deepEqual(ops[3].props,{value:'true',type:'boolean'});
 assert.deepEqual(ops[4].props,{formula:'SUM(B1:B2)'});
 assert.throws(()=>spreadsheetBatch([{name:'../escape',rows:[]}],true));
 assert.throws(()=>spreadsheetBatch([{name:'Data'},{name:'Data'}],true));
 assert.ok(documentBatch({title:'Title',blocks:[{type:'table',rows:[['a','b']]}]}).some(op=>op.path==='/body/tbl[1]/tr[1]'&&op.props?.c2==='b'));
 assert.ok(slideBatch([{title:'Title',notes:'Notes'}]).some(op=>op.path==='/slide[1]'&&op.props?.notes==='Notes'));
});

test('legacy document runtime refuses Python Office fallback and delegates configured OfficeCLI',async()=>{
 const app:any={dataDirectory:tmpdir(),ephemeral:new Map()};const documents=new DocumentRuntime(app);const ctx:any={app};
 try{await assert.rejects(documents.request('document_create',{format:'docx'},ctx),/OfficeCLI runtime is required/);await assert.rejects(documents.request('spreadsheet_create',{},ctx),/OfficeCLI runtime is required/);let operation='';app.ephemeral.set('officeRuntime',{request:async(name:string)=>{operation=name;return {runtime:'officecli'};}});assert.deepEqual(await documents.request('slides_create',{},ctx),{runtime:'officecli'});assert.equal(operation,'slides_create');assert.equal(documents.status,'idle');}finally{documents.close();}
});

test('OfficeCLI pinned binary creates, edits and reads real Office files without Python',{skip:!process.env.OFFICECLI_TEST_BINARY,timeout:180000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'officecli-proof-'));const files=new Map<string,any>();
 const app:any={dataDirectory:directory,root:process.cwd(),ephemeral:new Map(),store:{list:()=>[...files.values()],put:(_bucket:string,file:any)=>{files.set(file.id,file);return file;},get:(_bucket:string,id:string)=>files.get(id)}};
 const office=new OfficeRuntime(app);const ctx:any={app,conversationId:'proof',runId:'proof',signal:AbortSignal.timeout(160000),emit:()=>{},loadedSkills:new Map()};
 try{
  await mkdir(dirname(office.binary),{recursive:true});await copyFile(process.env.OFFICECLI_TEST_BINARY!,office.binary);await office.prepare();assert.equal(office.snapshot().version,OFFICECLI_VERSION);
  const create=await office.request('spreadsheet_create',{output_name:'proof.xlsx',sheets:[{name:'Data',rows:[['Item','Count'],['007',7],['Total','=SUM(B2:B2)'],['Boolean',true]]}]},ctx);
  assert.equal(create.runtime,'officecli');assert.equal(create.files[0].mediaType,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const workbook=await office.request('spreadsheet_inspect',{file_id:create.files[0].id,max_rows:10,max_columns:5},ctx);assert.equal(workbook.sheets[0].rows[1][0],'007');assert.equal(workbook.sheets[0].rows[2][1],'=SUM(B2:B2)');assert.equal(workbook.sheets[0].rows[3][1],true);
  const edit=await office.request('spreadsheet_edit',{file_id:create.files[0].id,output_name:'edit.xlsx',sheets:[{name:'Data',cells:[{cell:'B2',value:9}],formats:[{range:'A1:B1',bold:true,fill:'EAE8E1',font_color:'222222',alignment:'center',wrap_text:true}],freeze_panes:'A2',auto_filter:'A1:B4',column_widths:{A:20}}]},ctx);
  const changed=await office.request('spreadsheet_inspect',{file_id:edit.files[0].id,max_rows:10,max_columns:5},ctx);assert.equal(changed.sheets[0].rows[1][1],9);
  const original=await office.request('spreadsheet_inspect',{file_id:create.files[0].id,max_rows:10,max_columns:5},ctx);assert.equal(original.sheets[0].rows[1][1],7);
  const chart=await office.request('spreadsheet_chart',{file_id:edit.files[0].id,output_name:'chart.xlsx',sheet:'Data',range:'A1:B3',chart_type:'bar',anchor:'E2',title:'Totals'},ctx);
  const zip=await JSZip.loadAsync(await readFile(files.get(chart.files[0].id).absolutePath));assert.ok(Object.keys(zip.files).some(name=>/^xl\/(drawings\/)?charts\/chart\d+\.xml$/.test(name)));
  const doc=await office.request('document_create',{format:'docx',output_name:'proof.docx',title:'Document marker',blocks:[{type:'heading',text:'Heading marker'},{type:'paragraph',text:'Paragraph marker'},{type:'table',rows:[['A','B'],['TABLE_MARKER','2']]}]},ctx);
  const extracted=await office.request('document_extract',{file_id:doc.files[0].id},ctx);assert.match(extracted.text,/TABLE_MARKER/);
  const slides=await office.request('slides_create',{output_name:'proof.pptx',theme:{background:'FFFFFF',foreground:'222222',accent:'BC6045',font:'Arial'},slides:[{title:'Slide marker',body:'Body marker',notes:'Notes marker'},{title:'Table slide',table:{headers:['A','B'],rows:[['Table marker','2']]}}]},ctx);
  const deck=await office.request('slides_inspect',{file_id:slides.files[0].id},ctx);assert.equal(deck.slide_count,2);assert.ok(deck.slides[0].shapes.some((shape:any)=>shape.text==='Slide marker'));assert.equal(deck.slides[0].notes,'Notes marker');assert.deepEqual(deck.slides[1].shapes.find((shape:any)=>shape.table)?.table,[['A','B'],['Table marker','2']]);
  const shape=deck.slides[0].shapes.find((shape:any)=>shape.text==='Body marker');assert.ok(shape.shape_id);
  const edited=await office.request('slides_edit',{file_id:slides.files[0].id,output_name:'edited.pptx',changes:[{slide:1,shape_id:shape.shape_id,text:'Changed body',font_size:22,color:'224466',bold:true}],notes:[{slide:1,text:'Changed notes'}],add_slides:[{title:'Appended'}]},ctx);
  const deck2=await office.request('slides_inspect',{file_id:edited.files[0].id},ctx);assert.equal(deck2.slide_count,3);assert.ok(deck2.slides[0].shapes.some((s:any)=>s.text==='Changed body'));
  await assert.rejects(office.request('slides_edit',{file_id:slides.files[0].id,output_name:'unsupported.pptx',order:[2,1]},ctx),/not implemented/);
  await assert.rejects(office.request('spreadsheet_inspect',{file_id:doc.files[0].id},ctx),/Expected .xlsx/);
  await assert.rejects(office.request('spreadsheet_inspect',{file_id:'foreign'},ctx),/not in this workspace/);
  files.set('foreign-scope',{id:'foreign-scope',scope:'another-project',absolutePath:files.get(create.files[0].id).absolutePath});await assert.rejects(office.request('spreadsheet_inspect',{file_id:'foreign-scope'},ctx),/not in this workspace/);
  const sparse=await office.request('spreadsheet_edit',{file_id:create.files[0].id,output_name:'sparse.xlsx',sheets:[{name:'Data',cells:[{cell:'Z100',value:'BOUNDARY_MARKER'}]}]},ctx);const bounded=await office.request('spreadsheet_inspect',{file_id:sparse.files[0].id,max_rows:5,max_columns:5},ctx);assert.equal(bounded.sheets[0].row_count,100);assert.equal(bounded.sheets[0].column_count,26);assert.equal(bounded.truncated,true);
  await assert.rejects((office as any).command(['--version'],{timeout:1}),/timed out/);
  const cancelled={...ctx,signal:AbortSignal.abort()};await assert.rejects(office.request('spreadsheet_create',{output_name:'cancelled',sheets:[{name:'Data',rows:[]}]},cancelled));
 }finally{office.close();await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});

