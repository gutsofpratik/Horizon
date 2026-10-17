"""Compare base and adapted greedy tool behavior on the synthetic held-out split."""
import argparse,json,time
from pathlib import Path
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--base',required=True);parser.add_argument('--adapter',required=True);parser.add_argument('--dataset',required=True);args=parser.parse_args()
 import torch
 from transformers import AutoModelForCausalLM,AutoTokenizer
 from peft import PeftModel
 if not torch.cuda.is_available():raise ValueError('CUDA is required')
 tokenizer=AutoTokenizer.from_pretrained(args.base,local_files_only=True,trust_remote_code=False)
 model=AutoModelForCausalLM.from_pretrained(args.base,local_files_only=True,trust_remote_code=False,dtype=torch.bfloat16,attn_implementation='sdpa').to('cuda')
 model=PeftModel.from_pretrained(model,args.adapter,is_trainable=False);model.eval();model.config.use_cache=True
 rows=[json.loads(line) for line in Path(args.dataset,'evaluation.jsonl').read_text('utf-8').splitlines() if line.strip()];results=[]
 def generate(row):
  inputs=tokenizer.apply_chat_template(row['messages'][:-1],tokenize=True,add_generation_prompt=True,return_tensors='pt',return_dict=True).to('cuda')
  with torch.inference_mode():out=model.generate(**inputs,max_new_tokens=160,do_sample=False,pad_token_id=tokenizer.eos_token_id)
  return tokenizer.decode(out[0,inputs['input_ids'].shape[1]:],skip_special_tokens=True)
 def score(text,row):
  expected=row['messages'][-1]['content']
  if row['id'].startswith('social-'):return {'valid':bool(text.strip()),'toolMatch':None,'exact':None}
  try:
   actual=json.loads(text);wanted=json.loads(expected)
   return {'valid':isinstance(actual,dict) and isinstance(actual.get('tool_calls'),list),'toolMatch':[call.get('name') for call in actual.get('tool_calls',[])]==[call['name'] for call in wanted['tool_calls']],'exact':actual==wanted}
  except (ValueError,TypeError,AttributeError):return {'valid':False,'toolMatch':False,'exact':False}
 started=time.monotonic()
 for row in rows:
  with model.disable_adapter():base=generate(row)
  adapted=generate(row);results.append({'id':row['id'],'base':{'text':base,**score(base,row)},'adapted':{'text':adapted,**score(adapted,row)}})
  print(json.dumps({'id':row['id'],'baseExact':results[-1]['base']['exact'],'adaptedExact':results[-1]['adapted']['exact']}),flush=True)
 tool_rows=[row for row in results if row['adapted']['exact'] is not None]
 report={'scope':'Synthetic template holdout; not a general reliability benchmark','toolCases':len(tool_rows),'baseExact':sum(row['base']['exact'] for row in tool_rows),'adaptedExact':sum(row['adapted']['exact'] for row in tool_rows),'baseValidJson':sum(row['base']['valid'] for row in tool_rows),'adaptedValidJson':sum(row['adapted']['valid'] for row in tool_rows),'seconds':round(time.monotonic()-started,1),'results':results}
 Path(args.adapter,'behavior-evaluation.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps({key:value for key,value in report.items() if key!='results'}),flush=True)
if __name__=='__main__':main()

