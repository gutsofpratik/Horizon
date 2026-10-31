import type {FastifyInstance} from 'fastify';
import type {AppContext} from '../../app.ts';
import {ecosystemManifest} from './sources.ts';
import {ecosystemPackage,packageMetadata} from './registry.ts';
import {workflowRelations,validateRelations} from './relationships.ts';
import {installEcosystemPackage} from './packages.ts';
import {z} from 'zod';
import {sourceImportPreview} from './imports.ts';
import {registerSkillCatalogMcp} from './mcp.ts';
import {previewSkillMigration,rollbackSkillMigration} from './migration.ts';
export function registerEcosystemRoutes(app:FastifyInstance,context:AppContext){
 registerSkillCatalogMcp(app,context);
 app.get('/api/skills/ecosystem/migration',async()=>previewSkillMigration(context,(await ecosystemManifest(context.root))?.packages??[]));
 app.post('/api/skills/ecosystem/migration/rollback',async request=>{z.object({confirm:z.literal(true)}).strict().parse(request.body);return rollbackSkillMigration(context);});
 app.post('/api/skills/ecosystem/import/preview',async request=>{const body=z.object({url:z.string().url().max(2000),kind:z.enum(['skills','plugins'])}).strict().parse(request.body);const manifest=await ecosystemManifest(context.root);return manifest?sourceImportPreview(manifest,body.url,body.kind):{supported:false,items:[]};});
 app.get('/api/skills/ecosystem/sources',async()=>{const manifest=await ecosystemManifest(context.root);return {sources:manifest?.sources??[],pinned:true,telemetry:false};});
 app.get('/api/skills/ecosystem/workflows',async()=>{const manifest=await ecosystemManifest(context.root);const relations=workflowRelations(manifest?.packages??[]);validateRelations(relations);return {relations};});
 app.get('/api/skills/ecosystem/packages',async(request:any)=>{const {query,source,category,offset,limit}=z.object({query:z.string().max(300).default(''),source:z.string().max(150).optional(),category:z.string().max(100).optional(),offset:z.coerce.number().int().min(0).default(0),limit:z.coerce.number().int().min(1).max(100).default(36)}).parse(request.query);const manifest=await ecosystemManifest(context.root);const items=(manifest?.packages??[]).filter(p=>!p.duplicateOf&&(!source||p.sourceId===source)&&(!category||p.category===category)&&(p.name+' '+p.description).toLowerCase().includes(query.toLowerCase()));return {items:items.slice(offset,offset+limit).map(p=>packageMetadata(context,p)),total:items.length,nextOffset:offset+limit<items.length?offset+limit:null};});
 app.post('/api/skills/:id/update',async(request:any)=>{const pkg=await ecosystemPackage(context,request.params.id);if(!pkg)throw Error('Unknown pinned skill package');const result=await installEcosystemPackage(context,pkg);return {id:pkg.id,version:result.version,revision:pkg.revision,pinned:true};});
}
