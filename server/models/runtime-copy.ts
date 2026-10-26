import {cp} from 'node:fs/promises';
// Install real files, including when the packaged runtime root is a junction.
// Recreating symlinks requires elevated privileges on Windows.
export async function copyBundledRuntime(source:string,destination:string){
 await cp(source,destination,{recursive:true,dereference:true});
}
