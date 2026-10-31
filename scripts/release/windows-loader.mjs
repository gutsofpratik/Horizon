import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

/** A portable Windows executable must travel with its matching native loader. */
export async function readWindowsLoader(directory,arch){
 let bytes;try{bytes=await readFile(join(directory,'WebView2Loader.dll'));}catch(error){if(error.code==='ENOENT')throw new Error('WebView2Loader.dll is required for the Windows package. Rebuild the native target before packaging.',{cause:error});throw error;}
 const expected={x64:0x8664,arm64:0xaa64}[arch];if(!expected)throw new Error('Unsupported Windows loader architecture: '+arch);
 if(bytes.length<64||bytes.readUInt16LE(0)!==0x5a4d)throw new Error('WebView2Loader.dll is not a valid Windows library');
 const header=bytes.readUInt32LE(0x3c);if(header>bytes.length-6||bytes.readUInt32LE(header)!==0x4550)throw new Error('WebView2Loader.dll is not a valid Windows library');
 if(bytes.readUInt16LE(header+4)!==expected)throw new Error('WebView2Loader.dll architecture does not match '+arch);
 return bytes;
}
