import {createHash} from 'node:crypto';

export type ScenarioEntry={name:string;schema_hash:string;disposition:'code-case'|'dependency-blocked'|'category';fixtures?:string[];evidence_kind?:'code-contract'|'controlled-transport'|'local-service';members?:string[];blocker?:{issue:number;reason:string}};
export const scenarioSchemaHash=(schema:unknown)=>createHash('sha256').update(JSON.stringify(schema)).digest('hex');

/** A coverage disposition is not a live-service certification. Unknown tools fail closed. */
export function checkToolScenarios(catalog:{name:string;schema:unknown;members?:string[]}[],entries:ScenarioEntry[],evidence?:{event:string;name:string;status?:string;fixture?:string}[]){
 const errors:string[]=[],seen=new Set<string>(),byName=new Map(entries.map(entry=>[entry.name,entry]));
 const names=new Set(catalog.map(tool=>tool.name));
 for(const entry of entries){if(seen.has(entry.name))errors.push('Duplicate scenario: '+entry.name);seen.add(entry.name);if(!names.has(entry.name))errors.push('Removed or unknown tool: '+entry.name);}
 for(const tool of catalog){
  const entry=byName.get(tool.name);if(!entry){errors.push('Uncovered tool: '+tool.name);continue;}
  if(entry.schema_hash!==scenarioSchemaHash(tool.schema))errors.push('Schema changed; review scenarios: '+tool.name);
  if(entry.disposition==='code-case'){
   if(!['code-contract','controlled-transport','local-service'].includes(entry.evidence_kind??''))errors.push('Missing fixture execution kind: '+tool.name);
   if(!entry.fixtures?.length||entry.fixtures.some(fixture=>!fixture.trim()))errors.push('Missing successful fixture: '+tool.name);
   if(evidence&&!evidence.some(row=>row.name===tool.name&&(row.event==='handler_returned'||row.event==='execute'&&row.status==='succeeded')&&entry.fixtures?.some(fixture=>row.fixture?.replaceAll('\\','/').endsWith('/'+fixture))))errors.push('No successful execution evidence: '+tool.name);
  }else if(entry.disposition==='dependency-blocked'){
   if(!entry.blocker||!Number.isInteger(entry.blocker.issue)||entry.blocker.issue<=0||entry.blocker.reason.trim().length<30)errors.push('Missing explicit dependency blocker: '+tool.name);
  }else if(entry.disposition==='category'){
   const members=tool.members??[];if(!members.length||JSON.stringify([...(entry.members??[])].sort())!==JSON.stringify([...members].sort()))errors.push('Category membership changed: '+tool.name);
   for(const name of members)if(!byName.has(name))errors.push('Unclassified category member: '+name);
  }else errors.push('Invalid coverage disposition: '+tool.name);
 }
 return {errors,total:catalog.length,codeCases:entries.filter(e=>e.disposition==='code-case').length,dependencyBlocked:entries.filter(e=>e.disposition==='dependency-blocked').length,categories:entries.filter(e=>e.disposition==='category').length};
}
