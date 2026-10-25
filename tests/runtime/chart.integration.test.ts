import test from 'node:test';
import assert from 'node:assert/strict';
import {localFixture} from './local-fixture.ts';
test('local Python chart and image tools generate real PNG files from scoped CSV',{timeout:180000},async()=>{
 const fixture=await localFixture({documents:true});const {app,call}=fixture;
 try{const csv=await call('files_write',{path:'data.csv',text:'day,count\n1,3\n2,7\n3,9\n'});
 const chart=await call('chart_create',{data_file_id:csv.files[0].id,chart_type:'line',x:'day',y:'count',title:'Verification chart'});assert.equal(chart.data.rows_plotted,3);assert.equal(chart.data.runtime,'local-python');
 const image=await call('image_transform',{file_id:chart.files[0].id,operation:'resize',width:320,height:200});const response=await app.inject({url:image.files[0].url});assert.equal(response.statusCode,200);assert.equal(response.rawPayload.subarray(1,4).toString(),'PNG');assert.equal(response.rawPayload.readUInt32BE(16),320);assert.equal(response.rawPayload.readUInt32BE(20),200);
 }finally{await fixture.close();}
});
