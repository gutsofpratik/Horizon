/** Public web-edition boundary. The desktop package registry/engine and bundled collections are not exported. */
import {decideTool} from '../tools/policy.ts';
export async function ecosystemEnabled(..._:any[]){return false;}
export async function ecosystemManifest(..._:any[]):Promise<any>{return undefined;}
export async function ecosystemCatalog(..._:any[]):Promise<any>{return undefined;}
export async function ecosystemPackage(..._:any[]):Promise<any>{return undefined;}
export async function readEcosystemSkill(..._:any[]):Promise<any>{return undefined;}
export async function readEcosystemResource(..._:any[]):Promise<any>{throw Error('Bundled upstream resources are available in the desktop edition');}
export async function installEcosystemPackage(..._:any[]):Promise<any>{throw Error('Desktop bundles cannot be installed in the web edition');}
export async function migrateSkillReferences(..._:any[]){}
export async function ecosystemPlugins(..._:any[]){return [];}
export async function installEcosystemPlugin(..._:any[]):Promise<any>{throw Error('Desktop plugin bundles are not part of this web edition');}
export function canonicalAlias(id:string){return id;}
export function resolveTaskSkills(..._:any[]):any{return {skillIds:[],reasons:{},skipped:[]};}
export const nativeBindingInstructions='Use only the actual offered web-edition functions. Supply complete typed argument objects and observed IDs. Skills do not add native desktop capabilities or bypass approvals.';
export function nativeToolResource(registry:any,name:string,ctx:any){const tool=registry.tools.get(name);if(!tool)throw Error('Unknown offered web operation');const permission=decideTool(tool,ctx,ctx.app.store.get('settings','main')??{});if(!permission.allowed)throw Error(permission.reason);return {tool:name,description:tool.description,input_schema:tool.inputSchema,contract:'Supply one complete typed argument object. This reference does not execute the operation.'};}
export function registerEcosystemRoutes(app:any,..._:any[]){app.post('/api/skills/ecosystem/import/preview',async()=>({supported:false,items:[],edition:'web'}));}

export async function syncFrameworkTemplates(..._:any[]){}
export async function readFrameworkResource(..._:any[]):Promise<string>{throw Error('Bundled frameworks are desktop-only');}
