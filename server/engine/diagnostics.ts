const secretField=/^(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|authorization|client[_-]?secret|credential)$/i;
/** Diagnostics may contain data from an external CLI; never trust it to redact itself. */
export function publicDiagnostic(value:any,depth=0):any{
 if(depth>16)return '[Nested diagnostic omitted]';
 if(typeof value==='string')return value.replace(/\bBearer\s+[^\s"',;]+/gi,'Bearer [redacted]').replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|client[_-]?secret)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,'$1[redacted]');
 if(Array.isArray(value))return value.map(item=>publicDiagnostic(item,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,secretField.test(key)?'[redacted]':publicDiagnostic(item,depth+1)]));
 return value;
}
export function publicCommandArguments(args:unknown){
 if(!Array.isArray(args))return [];
 let secret=false;
 return args.map(item=>{const text=String(item);if(secret){secret=false;return '[redacted]';}if(/^--?(?:api[_-]?key|token|access[_-]?token|password|secret|client[_-]?secret)$/i.test(text)){secret=true;return text;}return publicDiagnostic(text);});
}
export async function engineRequestError(response:Response){
 const reader=response.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
 if(reader)try{while(size<16384){const {value,done}=await reader.read();if(done)break;chunks.push(value.subarray(0,16384-size));size+=value.length;}}finally{await reader.cancel().catch(()=>{});}
 const raw=new TextDecoder().decode(Buffer.concat(chunks));let parsed:any;try{parsed=JSON.parse(raw);}catch{}
 const error=publicDiagnostic(parsed?.error??parsed??{});
 const message=typeof error==='string'?error:typeof error.message==='string'?error.message:'Check the selected agent’s diagnostics, installation and authentication.';
 return Object.assign(new Error('Agent backend ('+response.status+'): '+message.slice(0,1200)),{statusCode:response.status,code:typeof error?.code==='string'?error.code:'ENGINE_REQUEST_FAILED'});
}
