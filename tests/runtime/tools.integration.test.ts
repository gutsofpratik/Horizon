import test from 'node:test';
import assert from 'node:assert/strict';
import {localFixture} from './local-fixture.ts';
test('local PDF and OfficeCLI create and inspect real files with native-format previews',{timeout:240000},async()=>{
 const fixture=await localFixture({documents:true,office:true});const {app,call}=fixture;
 try{for(const format of ['pdf','docx','xlsx','pptx']){
 const name=format==='xlsx'?'spreadsheet_create':format==='pptx'?'slides_create':'document_create';
 const args=format==='xlsx'?{output_name:'proof.xlsx',sheets:[{name:'Data',rows:[['Item','Count'],['ACTUAL_DOCUMENT_MARKER',7]]}]}:format==='pptx'?{output_name:'proof.pptx',slides:[{title:'Runtime verification',body:'ACTUAL_DOCUMENT_MARKER'}]}:{format,title:'Runtime verification',output_name:'proof.'+format,blocks:[{type:'paragraph',text:'ACTUAL_DOCUMENT_MARKER'},{type:'table',rows:[['Item','Count'],['Verified','7']]}]};
 const result=await call(name,args);assert.equal(result.data.runtime,format==='pdf'?'local-python':'officecli');assert.ok(!result.data.preview_error,result.data.preview_error);
 const file=result.files.find((item:any)=>item.name.endsWith('.'+format));assert.ok(file);const response=await app.inject({url:file.url});assert.equal(response.statusCode,200);assert.equal(response.rawPayload.subarray(0,format==='pdf'?4:2).toString(),format==='pdf'?'%PDF':'PK');
 const preview=result.files.find((item:any)=>item.mediaType===(format==='pdf'?'image/png':'text/html'));assert.ok(preview,'Expected real rendered preview for '+format);const rendered=await app.inject({url:preview.url});assert.equal(rendered.statusCode,200);if(format==='pdf')assert.equal(rendered.rawPayload.subarray(1,4).toString(),'PNG');else assert.match(rendered.body,/html/i);
 const inspect=await call(format==='xlsx'?'spreadsheet_inspect':format==='pptx'?'slides_inspect':'document_extract',{file_id:file.id});assert.match(JSON.stringify(inspect.data),/ACTUAL_DOCUMENT_MARKER/);
 }}finally{await fixture.close();}
});
