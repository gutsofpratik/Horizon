import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,unlink} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {createHash} from 'node:crypto';
import {listOllamaModels,importOllamaModel} from '../server/models/ollama-import.ts';import {Store} from '../server/storage/database.ts';
test('offline Ollama import preserves weights, settings, templates and metadata without loading inference',async()=>{
 const root=await mkdtemp(join(tmpdir(),'openclaude-ollama-test-'));const store=new Store(':memory:');
 try{const source=join(root,'source'),target=join(root,'app');await mkdir(join(source,'blobs'),{recursive:true});await mkdir(join(source,'manifests','registry.ollama.ai','library','sample'),{recursive:true});
 const blob=async(mediaType:string,text:string)=>{const data=Buffer.from(text),digest='sha256:'+createHash('sha256').update(data).digest('hex');await writeFile(join(source,'blobs',digest.replace(':','-')),data);return {mediaType,digest,size:data.length};};
 const config=await blob('application/vnd.docker.container.image.v1+json','{"model_format":"gguf"}');
 const layers=await Promise.all([blob('application/vnd.ollama.image.model','GGUF-test-weights'),blob('application/vnd.ollama.image.params',JSON.stringify({num_ctx:150000,temperature:1,top_p:.95,top_k:64,draft_num_predict:3})),blob('application/vnd.ollama.image.template','{{ .Prompt }}'),blob('application/vnd.ollama.image.system','Answer concisely.'),blob('application/vnd.ollama.image.license','Original license')]);
 await writeFile(join(source,'manifests','registry.ollama.ai','library','sample','latest'),JSON.stringify({schemaVersion:2,config,layers}));
 const list=await listOllamaModels(source);assert.equal(list[0].name,'sample:latest');const app:any={store,dataDirectory:target};
 const imported=await importOllamaModel(app,list[0].id,source);assert.equal(await readFile(imported.path,'utf8'),'GGUF-test-weights');assert.deepEqual(imported.configuration,{engine:'llama.cpp',contextTokens:150000,temperature:1,topP:.95,topK:64});
 assert.equal(imported.ollama.template,'{{ .Prompt }}');assert.equal(imported.ollama.system,'Answer concisely.');assert.equal(imported.ollama.parameters.draft_num_predict,3);assert.deepEqual(JSON.parse(await readFile(imported.source.metadataPath,'utf8')).manifest.layers,layers);
 store.put('local_models',{...imported,configuration:{...imported.configuration,contextTokens:100000}});assert.equal((await importOllamaModel(app,list[0].id,source)).configuration.contextTokens,100000);
 store.delete('local_models',imported.id);await unlink(imported.path);await writeFile(imported.path,'GG');
 const recovered=await importOllamaModel(app,list[0].id,source);assert.equal(await readFile(recovered.path,'utf8'),'GGUF-test-weights');
 await assert.rejects(importOllamaModel(app,'../../not-a-model',source),/not found/);
 }finally{store.close();assert.ok(resolve(root).startsWith(resolve(tmpdir(),'openclaude-ollama-test-')));await rm(root,{recursive:true,force:true});}
});
