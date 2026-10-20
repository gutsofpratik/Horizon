// This executable is launched only inside Docker. It has no host credentials.
import readline from 'node:readline';
const pending=new Map();let next=0;const protocol=process.stdout.write.bind(process.stdout);
const send=value=>protocol(JSON.stringify(value)+'\n');
console.log=(...values)=>send({type:'log',text:values.map(value=>typeof value==='string'?value:JSON.stringify(value)).join(' ').slice(0,10000)});
console.error=console.log;
const lines=readline.createInterface({input:process.stdin});let started=false;
lines.on('line',async line=>{let data;try{data=JSON.parse(line);}catch{return;}
 if(data.type==='reply'){const item=pending.get(data.id);if(item){pending.delete(data.id);data.error?item.reject(new Error(data.error)):item.resolve(data.result);}return;}
 if(data.type!=='start'||started)return;started=true;const allowed=new Set(data.tools);
 const tools=new Proxy(Object.create(null),{get:(_target,name)=>{if(name==='then')return undefined;return args=>{if(!allowed.has(name))return Promise.reject(new Error('Tool not allowed: '+String(name)));const id=String(++next);return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});send({type:'call',id,name,arguments:args});});};}});
 try{const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;const result=await new AsyncFunction('tools',data.code)(tools);send({type:'done',result:result??null});}catch(error){send({type:'failed',error:String(error.message).slice(0,12000)});}finally{process.exit(0);}
});
