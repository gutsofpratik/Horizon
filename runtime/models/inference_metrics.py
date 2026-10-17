def inference_metrics(job,finished):
    prompt=len(job['prompt']);cached=job.get('cached_tokens',0)
    ready=job.get('prefill_completed') or finished
    prefill=max(0,ready-job['prefill_started']);generation=max(0,finished-ready)
    return {'prompt_tokens':prompt,'completion_tokens':job['generated'],'total_tokens':prompt+job['generated'],
            'prompt_tokens_details':{'cached_tokens':cached},'prompt_eval_tokens':prompt-cached,
            'cache_matched_prefix_tokens':job.get('matched_prefix_tokens',0),'cache_checkpoint_rewind_tokens':max(0,job.get('matched_prefix_tokens',0)-cached),
            'prompt_eval_seconds':round(prefill,4),'generation_seconds':round(generation,4),
            'prompt_tokens_per_second':round((prompt-cached)/prefill,2) if prefill else 0,
            'generation_tokens_per_second':round(job['generated']/generation,2) if generation else 0}
