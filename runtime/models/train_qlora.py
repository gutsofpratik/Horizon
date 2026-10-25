"""Supervised Horizon adapter training for a pinned Qwen3.5 checkpoint."""
import argparse,json,random,time,math
from pathlib import Path
from train_lora import encode_example
from qlora import prepare_frozen_base,completion_loss

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--base',required=True);parser.add_argument('--dataset',required=True);parser.add_argument('--output',required=True);parser.add_argument('--steps',type=int,default=228);parser.add_argument('--sequence',type=int,default=1536);parser.add_argument('--rank',type=int,default=16);parser.add_argument('--accumulation',type=int,default=4);parser.add_argument('--eval-every',type=int,default=38);args=parser.parse_args()
 import torch
 from transformers import AutoTokenizer,AutoModelForImageTextToText,BitsAndBytesConfig
 from peft import LoraConfig,get_peft_model,get_peft_model_state_dict,set_peft_model_state_dict
 output=Path(args.output).resolve();base=Path(args.base).resolve();data=Path(args.dataset).resolve()
 if output.exists():raise ValueError('Choose a new adapter output folder')
 if not torch.cuda.is_available():raise ValueError('CUDA training is required; no CPU fallback was started')
 if not 1<=args.steps<=10000 or not 1<=args.accumulation<=32:raise ValueError('Invalid training schedule')
 torch.manual_seed(42);random.seed(42);torch.set_num_threads(4)
 tokenizer=AutoTokenizer.from_pretrained(str(base),local_files_only=True,trust_remote_code=False)
 train=[json.loads(line) for line in (data/'train.jsonl').read_text('utf-8').splitlines() if line.strip()];evaluation=[json.loads(line) for line in (data/'evaluation.jsonl').read_text('utf-8').splitlines() if line.strip()]
 samples=[encode_example(tokenizer,row,args.sequence) for row in train];heldout=[encode_example(tokenizer,row,args.sequence) for row in evaluation]
 print(json.dumps({'stage':'loading','train':len(samples),'heldout':len(heldout),'maxExampleTokens':max(len(ids) for ids,_ in samples+heldout),'quantization':'NF4 double quantization','cuda':torch.cuda.get_device_name(0)}),flush=True)
 quant=BitsAndBytesConfig(load_in_4bit=True,bnb_4bit_quant_type='nf4',bnb_4bit_use_double_quant=True,bnb_4bit_compute_dtype=torch.bfloat16)
 model=AutoModelForImageTextToText.from_pretrained(str(base),local_files_only=True,trust_remote_code=False,dtype=torch.bfloat16,quantization_config=quant,device_map={'':'cuda:0'},attn_implementation='sdpa')
 model=prepare_frozen_base(model)
 # Adapt the language model; freeze the vision tower. Both full attention and
 # all feed-forward blocks receive adapters. Native recurrent kernels stay intact.
 targets=r'.*language_model\.layers\.\d+\.(self_attn\.(q_proj|k_proj|v_proj|o_proj)|mlp\.(gate_proj|up_proj|down_proj))'
 model=get_peft_model(model,LoraConfig(task_type='CAUSAL_LM',r=args.rank,lora_alpha=args.rank*2,lora_dropout=.05,target_modules=targets,bias='none'))
 model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={'use_reentrant':False});model.enable_input_require_grads();trainable=sum(p.numel() for p in model.parameters() if p.requires_grad)
 if not trainable:raise ValueError('No supported language modules matched the adapter target expression')
 print(json.dumps({'stage':'loaded','trainableParameters':trainable,'allocatedMiB':torch.cuda.memory_allocated()//1024**2}),flush=True)
 def evaluate():
  model.eval()
  with torch.no_grad():value=sum(float(completion_loss(model,ids,labels)) for ids,labels in heldout)/len(heldout)
  if not math.isfinite(value):raise ValueError('Non-finite evaluation loss; adapter was not published')
  return value
 before=evaluate();best_loss=before;best_state=None;best_step=0;stale=0;history=[];started=time.monotonic();order=list(range(len(samples)));random.shuffle(order);optimizer=torch.optim.AdamW([p for p in model.parameters() if p.requires_grad],lr=1e-4);optimizer.zero_grad(set_to_none=True);model.train()
 for step in range(args.steps):
  loss_sum=0
  for micro in range(args.accumulation):
   index=(step*args.accumulation+micro)%len(order)
   if index==0:random.shuffle(order)
   ids,labels=samples[order[index]];loss=completion_loss(model,ids,labels)
   if not torch.isfinite(loss):raise ValueError('Non-finite training loss; no adapter was published')
   loss_sum+=float(loss.detach());(loss/args.accumulation).backward()
  torch.nn.utils.clip_grad_norm_(model.parameters(),1);warmup=min(1,(step+1)/10);decay=.5*(1+math.cos(math.pi*step/args.steps));optimizer.param_groups[0]['lr']=1e-4*warmup*decay;optimizer.step();optimizer.zero_grad(set_to_none=True)
  if step%5==0 or step==args.steps-1:print(json.dumps({'stage':'training','step':step+1,'steps':args.steps,'loss':loss_sum/args.accumulation,'elapsedSeconds':round(time.monotonic()-started,1),'peakMiB':torch.cuda.max_memory_allocated()//1024**2}),flush=True)
  if (step+1)%args.eval_every==0 or step==args.steps-1:
   score=evaluate();history.append({'step':step+1,'loss':score});print(json.dumps({'stage':'validation',**history[-1]}),flush=True)
   if score<best_loss-1e-4:
    best_loss=score;best_step=step+1;best_state={key:value.detach().cpu().clone() for key,value in get_peft_model_state_dict(model).items()};stale=0
    checkpoint=output.parent/(output.name+'-checkpoint');model.save_pretrained(str(checkpoint),safe_serialization=True);(checkpoint/'README.md').unlink(missing_ok=True);(checkpoint/'checkpoint-status.json').write_text(json.dumps({'status':'training-checkpoint-not-validated-for-use','step':best_step,'holdoutLoss':best_loss}),encoding='utf-8')
   else:stale+=1
   model.train()
   if stale>=3:break
 if best_state is None:raise ValueError('No held-out improvement was measured; no trained adapter was published')
 set_peft_model_state_dict(model,best_state);output.mkdir(parents=True);model.save_pretrained(str(output),safe_serialization=True);(output/'README.md').unlink(missing_ok=True)
 source=json.loads((base/'source.json').read_text());config=json.loads((output/'adapter_config.json').read_text());config.update(base_model_name_or_path=source['repo'],revision=source['revision']);(output/'adapter_config.json').write_text(json.dumps(config,indent=2),encoding='utf-8')
 report={'status':'trained-awaiting-behavior-evaluation','base':source,'dataset':json.loads((data/'dataset.json').read_text()),'quantization':'NF4 double quantization','rank':args.rank,'targets':targets,'trainableParameters':trainable,'completedSteps':step+1,'bestStep':best_step,'holdoutLossBefore':before,'holdoutLossAfter':best_loss,'validation':history,'trainingSeconds':round(time.monotonic()-started,1),'peakAllocatedMiB':torch.cuda.max_memory_allocated()//1024**2,'trainingSequenceLimit':args.sequence,'inferenceContextUnchanged':True,'scope':'Synthetic Horizon workflows. Does not establish general reliability or 150K-context quality.'}
 (output/'training-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report),flush=True)
if __name__=='__main__':main()
