import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptEvidence,countSites,websiteDomain} from '../server/research/accounting.ts';
const body=(marker:string)=>('Actual extracted evidence describes the subject with readable complete statements and supporting details. '.repeat(8)+marker);
const origin={url:'https://discovered.com/start',query:'real query'};
test('registrable domains group public subdomains and private hosted websites correctly',()=>{
 assert.equal(websiteDomain('https://news.example.co.uk/source'),'example.co.uk');
 assert.equal(websiteDomain('https://www.example.co.uk/other'),'example.co.uk');
 assert.equal(websiteDomain('https://first.blogspot.com/'),'first.blogspot.com');
 for(const url of ['http://127.0.0.1/','http://10.1.2.3/','http://[::1]/','http://localhost/','https://files.local/','https://host.internal/','file:///thing','https://user:password@example.com'])assert.equal(websiteDomain(url),null,url);
});
test('redirects count the final destination website and block its other subdomains',()=>{
 const accepted=acceptEvidence([],{url:'https://news.final.co.uk/path',text:body('original')},origin,'one');
 assert.equal(accepted.source?.domain,'final.co.uk');assert.equal(accepted.source?.originalUrl,origin.url);
 assert.equal(acceptEvidence([accepted.source],{url:'https://www.final.co.uk/other',text:body('different')},origin,'two').source,undefined);
 assert.equal(countSites([accepted.source]),1);
});
test('copied normalized content cannot inflate distinct website scans',()=>{
 const source=acceptEvidence([],{url:'https://first.com/a',text:body('copied')},origin,'one').source!;
 const duplicate=acceptEvidence([source],{url:'https://second.com/a',text:body('copied').toUpperCase().replaceAll(' ','  ')},origin,'two');
 assert.match(duplicate.reason!,/duplicates/);assert.equal(duplicate.source,undefined);
 assert.match(source.digest,/^[a-f0-9]{64}$/);assert.equal(source.note,'');
});
test('unread results, snippets, PDF bytes and access challenges are excluded',()=>{
 for(const page of [{url:'https://first.com'}, {url:'https://first.com',text:'Search snippet only.'}, {url:'https://first.com',text:body('PDF'),bytes:Buffer.from('%PDF-1.4')}, {url:'https://first.com',title:'Just a moment...',text:body('blocked')}, {url:'https://first.com',text:'Verify you are human. '+body('challenge')}])assert.equal(acceptEvidence([],page,origin,'excluded').source,undefined);
});
test('100 URLs on one website cannot meet 100 websites; 100 actual distinct reads can',()=>{
 const same:any[]=[];for(let index=0;index<100;index++){const result=acceptEvidence(same,{url:'https://only.com/'+index,text:body(String(index))},origin,String(index));if(result.source)same.push(result.source);}
 assert.equal(countSites(same),1);
 const distinct:any[]=[];for(let index=0;index<100;index++){const result=acceptEvidence(distinct,{url:'https://site'+index+'.com/page',text:body('unique source '+index)},origin,String(index));assert.ok(result.source,result.reason??"Evidence should be accepted");distinct.push(result.source);}
 assert.equal(countSites(distinct),100);
});
test('evidence storage is bounded while the digest uses the full extracted text',()=>{
 const source=acceptEvidence([],{url:'https://first.com',text:body('long').repeat(30)},origin,'one').source!;assert.equal(source.text.length,12000);
 assert.ok(Number.isFinite(Date.parse(source.retrievedAt)));
});
