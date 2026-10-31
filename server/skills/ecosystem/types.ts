export type LicenseDecision='allowed'|'restricted'|'unresolved';
export type Requirement={kind:'tool'|'runtime'|'credential'|'host';id:string};
export interface SourceDescriptor {id:string;repository:string;revision:string;name:string;roots:string[];licenseNote:string;}
export interface PackageFile {path:string;sourcePath:string;sha256:string;bytes:number;gitBlobSha1?:string;}
export interface SkillPackage {
 id:string;sourceId:string;repository:string;revision:string;sourcePath:string;name:string;description:string;
 category:string;license:{decision:LicenseDecision;label:string;evidence:string[];reason?:string};
 digest:string;files:PackageFile[];requirements:Requirement[];defaultInstalled?:boolean;
 compatibility:'mapped'|'review-required';adapter?:string;aliases?:string[];duplicateOf?:string;
 kind:'skill'|'plugin';pluginId?:string;sourceVersion?:string;entrypoint?:string;componentKind?:'command';
}
export interface PluginDescriptor {id:string;name:string;description:string;repository:string;revision:string;sourcePath:string;sourceFamily:string;license:{decision:LicenseDecision;label:string;reason?:string};skillIds:string[];components:{name:string;status:string}[];manifest:Record<string,unknown>;}
export interface EcosystemManifest {version:1;sources:SourceDescriptor[];packages:SkillPackage[];plugins?:PluginDescriptor[];generatedAt:string;}
export interface Selection {skillIds:string[];reasons:Record<string,string>;skipped:{id:string;reason:string}[];}
export interface SkillRelation {from:string;to:string;stage:'planning'|'implementation'|'debugging'|'verification'|'related';}
export interface PackageInstallation {id:string;installed:boolean;enabled:boolean;version:string;packageRoot?:string;previousVersion?:string;}
