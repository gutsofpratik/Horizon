import {cpus,totalmem,freemem,platform,arch} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const gib=1024**3;
let cached:any,expires=0;
export async function modelHardware(){
 if(cached&&Date.now()<expires)return cached;
 const gpus:{name:string;totalGiB:number;freeGiB:number}[]=[];
 try{const {stdout}=await promisify(execFile)('nvidia-smi',['--query-gpu=name,memory.total,memory.free','--format=csv,noheader,nounits'],{timeout:4000,windowsHide:true});for(const row of stdout.trim().split('\n')){const [name,total,free]=row.split(',').map(value=>value.trim());if(Number(total)>0&&Number(free)>=0)gpus.push({name,totalGiB:Number(total)/1024,freeGiB:Number(free)/1024});}}catch{}
 const unified=platform()==='darwin'&&arch()==='arm64';
 const available=unified?Math.min(totalmem()/gib*.65,freemem()/gib*.85):gpus.length?Math.max(...gpus.map(gpu=>gpu.freeGiB))*.75:Math.min(totalmem()/gib*.5,freemem()/gib*.7);
 const weightBudgetGiB=Math.max(.25,available);
 cached={platform:platform(),arch:arch(),cpu:cpus()[0]?.model??'Processor',ramGiB:totalmem()/gib,availableRamGiB:freemem()/gib,gpus,unified,weightBudgetGiB,estimated:true,tiers:[{id:'performance',label:'Best performance',maxWeightGiB:Math.min(weightBudgetGiB,Math.max(.25,weightBudgetGiB*.35)),description:'Smaller models for quicker replies.'},{id:'overall',label:'Best overall',maxWeightGiB:weightBudgetGiB*.65,description:'A balance of model size and headroom.'},{id:'quality',label:'Best quality',maxWeightGiB:weightBudgetGiB,description:'Larger models within the estimated budget.'}]};expires=Date.now()+60000;return cached;
}
export function modelParameterBillions(name:string):number|null{
 const match=name.match(/(?:^|[-_ /])(\d+(?:\.\d+)?)b(?:[-_ /]|$)/i);
 return match?Number(match[1]):null;
}
