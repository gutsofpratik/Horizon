def batch_rows(jobs,capacity,prefill_chunk=None):
    """Decode tokens first, then give each prefill a bounded fair share."""
    rows=[];sample={}
    decoding=[job for job in jobs if job['prompt_offset']==len(job['prompt']) and job.get('next_token') is not None]
    prefilling=[job for job in jobs if job['prompt_offset']<len(job['prompt'])]
    for job in decoding:
        if len(rows)>=capacity:break
        rows.append((job['next_token'],job['position'],job['slot'],True));job['position']+=1;job['next_token']=None
        sample[job['slot']]=len(rows)-1
    quota=min(prefill_chunk if prefill_chunk is not None else capacity,max(1,(capacity-len(rows))//max(1,len(prefilling))))
    for job in prefilling:
        take=min(quota,capacity-len(rows),len(job['prompt'])-job['prompt_offset'])
        boundary=job.get('prefill_boundary',0)
        if job['prompt_offset']<boundary:take=min(take,boundary-job['prompt_offset'])
        for _ in range(take):
            token=job['prompt'][job['prompt_offset']];job['prompt_offset']+=1
            final=job['prompt_offset']==len(job['prompt'])
            rows.append((token,job['position'],job['slot'],final));job['position']+=1
            if final:sample[job['slot']]=len(rows)-1
    return rows,sample
