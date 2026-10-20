"""Train a model-specific PEFT adapter locally. CUDA required; never replaces the base."""
import argparse,json,random,time,hashlib
from pathlib import Path

def encode_example(tokenizer,row,max_length):
    messages=row['messages'];prefix=tokenizer.apply_chat_template(messages[:-1],tokenize=False,add_generation_prompt=True,enable_thinking=row.get('thinking',False))
    full=tokenizer.apply_chat_template(messages,tokenize=False,add_generation_prompt=False,enable_thinking=row.get('thinking',False))
    if not full.startswith(prefix):raise ValueError('Training template does not preserve the assistant prefix')
    prefix_ids=tokenizer.encode(prefix,add_special_tokens=False);ids=tokenizer.encode(full,add_special_tokens=False)
    if len(ids)>max_length:raise ValueError(f'Example {row["id"]} needs {len(ids)} tokens; increase --sequence, never truncate away the target')
    labels=[-100]*len(prefix_ids)+ids[len(prefix_ids):]
    if not any(label!=-100 for label in labels):raise ValueError('No assistant training labels')
    return ids,labels

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--base',required=True);parser.add_argument('--dataset',required=True);parser.add_argument('--output',required=True);parser.add_argument('--steps',type=int,default=160);parser.add_argument('--sequence',type=int,default=1024);parser.add_argument('--rank',type=int,default=8);args=parser.parse_args()
    output=Path(args.output).resolve()
    if output.exists():raise ValueError('Choose a new output folder; existing adapters are never overwritten')
    import torch
    if not torch.cuda.is_available():raise ValueError('Training requires CUDA PyTorch in the isolated training environment; CPU training was not started')
    from transformers import AutoModelForCausalLM,AutoTokenizer
    from peft import LoraConfig,get_peft_model
    random.seed(42);torch.manual_seed(42);torch.set_num_threads(4)
    base=Path(args.base).resolve();dataset=Path(args.dataset).resolve()
    if not (base/'config.json').is_file() or not list(base.glob('*.safetensors')):raise ValueError('Training needs a complete local trainable safetensors base; GGUF inference files are not accepted')
    tokenizer=AutoTokenizer.from_pretrained(str(base),local_files_only=True,trust_remote_code=False)
    train=[json.loads(line) for line in (dataset/'train.jsonl').read_text('utf-8').splitlines() if line.strip()]
    evaluation=[json.loads(line) for line in (dataset/'evaluation.jsonl').read_text('utf-8').splitlines() if line.strip()]
    samples=[encode_example(tokenizer,row,args.sequence) for row in train];heldout=[encode_example(tokenizer,row,args.sequence) for row in evaluation]
    free,total=torch.cuda.mem_get_info()
    if free<1800*1024**2:raise ValueError('Less than 1.8 GiB CUDA memory is free; finish other GPU work before training')
    print(json.dumps({'stage':'loading','cuda':torch.cuda.get_device_name(0),'freeMiB':free//1024**2,'examples':len(samples)}),flush=True)
    model=AutoModelForCausalLM.from_pretrained(str(base),local_files_only=True,trust_remote_code=False,dtype=torch.bfloat16,attn_implementation='sdpa').to('cuda')
    model.config.use_cache=False
    model=get_peft_model(model,LoraConfig(task_type='CAUSAL_LM',r=args.rank,lora_alpha=args.rank*2,lora_dropout=.05,target_modules=['q_proj','v_proj'],bias='none'))
    model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={'use_reentrant':False});model.enable_input_require_grads()
    def batch(sample):
        ids,labels=sample
        return {'input_ids':torch.tensor([ids],device='cuda'),'attention_mask':torch.ones((1,len(ids)),device='cuda',dtype=torch.long),'labels':torch.tensor([labels],device='cuda')}
    def loss_on_holdout():
        model.eval()
        with torch.no_grad():return sum(float(model(**batch(sample)).loss) for sample in heldout)/len(heldout)
    before=loss_on_holdout();optimizer=torch.optim.AdamW([p for p in model.parameters() if p.requires_grad],lr=2e-4);started=time.monotonic();order=list(range(len(samples)));random.shuffle(order);losses=[]
    model.train();optimizer.zero_grad(set_to_none=True)
    for step in range(args.steps):
        total_loss=0
        for micro in range(4):
            index=(step*4+micro)%len(order)
            if index==0:random.shuffle(order)
            loss=model(**batch(samples[order[index]])).loss;total_loss+=float(loss.detach());(loss/4).backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(),1);optimizer.step();optimizer.zero_grad(set_to_none=True);losses.append(total_loss/4)
        if step%10==0 or step==args.steps-1:print(json.dumps({'stage':'training','step':step+1,'steps':args.steps,'loss':losses[-1],'elapsedSeconds':round(time.monotonic()-started,1)}),flush=True)
    after=loss_on_holdout();output.mkdir(parents=True);model.save_pretrained(str(output),safe_serialization=True)
    (output/'README.md').unlink(missing_ok=True)
    source=json.loads((base/'source.json').read_text()) if (base/'source.json').is_file() else {}
    config=json.loads((output/'adapter_config.json').read_text());config['base_model_name_or_path']=source.get('repo',str(base));config['revision']=source.get('revision');(output/'adapter_config.json').write_text(json.dumps(config,indent=2),encoding='utf-8')
    report={'status':'trained','basePath':str(base),'baseConfigSha256':hashlib.sha256((base/'config.json').read_bytes()).hexdigest(),'dataset':json.loads((dataset/'dataset.json').read_text()),'steps':args.steps,'rank':args.rank,'targets':['q_proj','v_proj'],'cuda':torch.cuda.get_device_name(0),'holdoutLossBefore':before,'holdoutLossAfter':after,'improvedHeldoutLoss':after<before,'trainingSeconds':round(time.monotonic()-started,2),'peakAllocatedMiB':torch.cuda.max_memory_allocated()//1024**2,'scope':'Pilot synthetic workflow adapter; held-out loss is not proof of general tool reliability. Not compatible with Bonsai.'}
    (output/'training-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report),flush=True)
if __name__=='__main__':main()
