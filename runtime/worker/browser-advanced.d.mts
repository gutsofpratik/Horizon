import type {Page,ElementHandle} from 'playwright';
export const advancedNames:Set<string>;
export function browserAdvanced(tab:{page:Page;snapshotId?:string;refs?:Map<string,ElementHandle>},name:string,args:Record<string,any>):Promise<any>;
