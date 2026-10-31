"""Continuous decoding slots sharing one llama.cpp model and native context."""
import codecs,ctypes,contextlib,queue,threading,secrets,time
from batch_plan import batch_rows

class BatchedDecoder:
    def __init__(self,model,context,slots):
        import llama_cpp
        from llama_cpp import _internals
        self.model=model;self.slots=slots;self.capacity=model.n_batch;self.pending=queue.Queue();self.closed=False;self.state_lock=threading.Lock();self.active={};self.decode_calls=0;self.max_batch_sequences=0
        # Weight tensors are retained. Only the KV/context allocation changes.
        model._ctx.close();model._batch.close()
        params=type(model.context_params)()
        ctypes.memmove(ctypes.addressof(params),ctypes.addressof(model.context_params),ctypes.sizeof(params))
        params.n_ctx=context*slots;params.n_seq_max=slots;params.kv_unified=True
        try:
            self.ctx=model._stack.enter_context(contextlib.closing(_internals.LlamaContext(model=model._model,params=params,verbose=False)))
            if llama_cpp.llama_n_ctx_seq(self.ctx.ctx)<context:raise ValueError('Native slot context is smaller than the configured total context')
            self.batch=model._stack.enter_context(contextlib.closing(_internals.LlamaBatch(n_tokens=self.capacity,embd=0,n_seq_max=1,verbose=False)))
        except Exception:
            # Caller can retry fewer slots, retaining the shared weights.
            if hasattr(self,'ctx'):self.ctx.close()
            raise
        model._ctx=self.ctx;model._batch=self.batch
        from prompt_cache import PromptCache,RecurrentState
        recurrent=llama_cpp.llama_model_is_recurrent(model._model.model) or llama_cpp.llama_model_is_hybrid(model._model.model) or any(key.endswith('.attention.sliding_window') and int(value)>0 for key,value in model.metadata.items())
        # Two recurrent snapshots preserve policy and the latest conversation.
        # Bound their host-RAM budget by currently available memory.
        try:
            import psutil
            state_budget=max(16*1024*1024,min(768*1024*1024,int(psutil.virtual_memory().available*.05)))
        except ImportError:state_budget=256*1024*1024
        self.cache=PromptCache(self.ctx,RecurrentState(llama_cpp,self.ctx.ctx,state_budget) if recurrent else None,byte_limit=state_budget)
        self.thread=threading.Thread(target=self._run,daemon=True);self.thread.start()

    def completion(self,prompt,max_tokens,temperature,grammar,stop,cancel,native_thinking=False,cache_scope=None,system_boundary=0,policy_boundary=0,**sampling):
        out=queue.Queue();job=dict(prompt=prompt,max_tokens=max_tokens,temperature=temperature,grammar=grammar,stop=stop,cancel=cancel,out=out,sampling=sampling,native_thinking=native_thinking,cache_scope=cache_scope if isinstance(prompt,list) else None,system_boundary=system_boundary,policy_boundary=policy_boundary)
        with self.state_lock:
            rejected=self.closed
            if not rejected:self.pending.put(job)
        if rejected:
            if hasattr(prompt,'close'):prompt.close()
            raise ValueError('Inference runtime is closed')
        while True:
            item=out.get()
            if isinstance(item,Exception):raise item
            if item is None:return
            yield item

    def close(self):
        with self.state_lock:
            self.closed=True
            self.pending.put(None)
        if hasattr(self,'thread'):self.thread.join(timeout=30)
        if hasattr(self,'thread') and self.thread.is_alive():raise ValueError('Native decoding has not stopped; the model remains allocated')
        if hasattr(self,'cache'):
            for slot in list(set(self.cache.entries)|set(self.cache.checkpoints)):self.cache.discard(slot)

    def _sampler(self,job,grammar):
        from llama_cpp import _internals
        sampler=_internals.LlamaSampler();options=job['sampling']
        try:
            if grammar:
                from native_sampler import add_grammar
                add_grammar(sampler,self.model._model,grammar)
            sampler.add_penalties(self.model._model.n_vocab(),64,options.get('repeat_penalty',1.1),0,0)
            if job['temperature']<=0:sampler.add_greedy()
            else:
                sampler.add_top_k(options.get('top_k',40));sampler.add_top_p(options.get('top_p',0.95));sampler.add_min_p(0.05);sampler.add_temp(job['temperature'])
                seed=options.get('seed',-1);sampler.add_dist(seed if seed>=0 else secrets.randbits(32))
        except Exception:
            sampler.close()
            raise
        return sampler

    def _start(self,job,slot):
        sampler=self._sampler(job,None if job['native_thinking'] else job['grammar'])
        job.update(slot=slot,sampler=sampler,prompt_offset=0,position=0,next_token=None,generated=0,text='',sent=0,decoder=codecs.getincrementaldecoder('utf-8')('replace'),prefill_started=time.monotonic(),prefill_reported=0,prefill_last_report=0)
        self.active[slot]=job
        try:
            from prompt_cache import common_prefix
            previous=self.cache.entries.get(slot)
            matched=common_prefix(previous['tokens'],job['prompt']) if previous and previous['scope']==job['cache_scope'] else 0
            offset=self.cache.begin(slot,job['prompt'],job['cache_scope'])
            job['matched_prefix_tokens']=matched
            stable=job.get('system_boundary',0)
            history_boundary=max(0,len(job['prompt'])-32)
            boundaries=sorted(set(value for value in [job.get('policy_boundary',0),stable,history_boundary if history_boundary>max(stable,job.get('policy_boundary',0)) else 0] if offset<=value<len(job['prompt']) and value>0))
            boundary=boundaries.pop(0) if boundaries and self.cache.state and job['cache_scope'] else (max(offset,len(job['prompt'])-32) if self.cache.state and job['cache_scope'] and len(job['prompt'])>=96 else 0)
            job['remaining_boundaries']=boundaries
            job.update(prompt_offset=offset,position=offset,evaluated=list(job['prompt'][:offset]) if isinstance(job['prompt'],list) else [],cached_tokens=offset,prefill_boundary=boundary,checkpoint_saved=False)
            if boundary and boundary==offset:
                job['checkpoint_saved']=True;self.cache.capture(slot,job['evaluated'],job['cache_scope'])
                if job['remaining_boundaries']:job['prefill_boundary']=job['remaining_boundaries'].pop(0);job['checkpoint_saved']=False
            self._prefill_progress(job)
        except Exception as error:self._finish(job,error=error);return
        if hasattr(job['prompt'],'evaluate'):
            try:
                job['position']=job['prompt'].evaluate(self.ctx,slot,self.capacity,job['cancel']);job['prompt_offset']=len(job['prompt']);self._prefill_progress(job);self._sample(job,-1)
            except Exception as error:self._finish(job,error=error)

    def _prefill_progress(self,job):
        processed=job['prompt_offset'];total=len(job['prompt']);now=time.monotonic()
        if processed==total and not job.get('prefill_completed'):job['prefill_completed']=now
        if processed<=job['prefill_reported'] or (processed<total and now-job['prefill_last_report']<0.25):return
        job['prefill_reported']=processed;job['prefill_last_report']=now
        job['out'].put({'openclaude_progress':{'phase':'prefill','processedTokens':processed,'promptTokens':total,'cachedTokens':job.get('cached_tokens',0),'elapsedSeconds':round(now-job['prefill_started'],1)}})

    def _finish(self,job,reason='stop',error=None):
        slot=job['slot'];self.active.pop(slot,None)
        if hasattr(job['prompt'],'close'):job['prompt'].close()
        job['sampler'].close()
        try:
            if error or hasattr(job['prompt'],'evaluate'):self.cache.discard(slot)
            else:self.cache.finish(slot,job['evaluated'],job['cache_scope'])
        except Exception as fault:error=error or fault
        if error:job['out'].put(error)
        else:
            job['text']+=job['decoder'].decode(b'',final=True)
            tail=job['text'][job['sent']:]
            if tail:job['out'].put({'choices':[{'text':tail,'finish_reason':None}]})
            from inference_metrics import inference_metrics
            usage=inference_metrics(job,time.monotonic())
            usage['prompt_cache_state_bytes']=sum(len(item['data']) for items in self.cache.checkpoints.values() for item in items)
            usage['prompt_cache_checkpoints']=sum(len(items) for items in self.cache.checkpoints.values())
            job['out'].put({'choices':[{'text':'','finish_reason':reason}],'usage':usage});job['out'].put(None)

    def _sample(self,job,index):
        import llama_cpp
        token=job['sampler'].sample(self.ctx,index);job['generated']+=1
        if llama_cpp.llama_vocab_is_eog(self.model._model.vocab,token):self._finish(job);return
        job['text']+=job['decoder'].decode(self.model.detokenize([token],special=True))
        if job['native_thinking'] and '</think>' in job['text']:
            job['native_thinking']=False
            if job['grammar']:
                replacement=self._sampler(job,job['grammar'])
                job['sampler'].close();job['sampler']=replacement
        stops=[job['text'].find(stop) for stop in job['stop'] if stop and stop in job['text']]
        if stops:
            job['text']=job['text'][:min(stops)];self._finish(job);return
        # Hold only a possible stop-string prefix, not an arbitrary trailing window.
        withheld=0
        for stop in job['stop']:
            for size in range(1,min(len(stop),len(job['text']))+1):
                if job['text'].endswith(stop[:size]):withheld=max(withheld,size)
        safe=len(job['text'])-withheld
        if safe>job['sent']:
            job['out'].put({'choices':[{'text':job['text'][job['sent']:safe],'finish_reason':None}]});job['sent']=safe
        if job['generated']>=job['max_tokens']:self._finish(job,'length');return
        job['next_token']=token

    def _run(self):
        try:
            while not self.closed:
                while len(self.active)<self.slots:
                    try:job=self.pending.get(timeout=0.05 if not self.active else 0)
                    except queue.Empty:break
                    if job is None:break
                    if job['cancel'].is_set():
                        if hasattr(job['prompt'],'close'):job['prompt'].close()
                        job['out'].put(ValueError('Generation cancelled'));continue
                    free=[index for index in range(self.slots) if index not in self.active]
                    slot=self.cache.choose(free,job['prompt'],job['cache_scope']) if isinstance(job['prompt'],list) else free[0]
                    try:self._start(job,slot)
                    except Exception as error:job['out'].put(error)
                if not self.active:continue
                for job in list(self.active.values()):
                    if job['cancel'].is_set():self._finish(job,error=ValueError('Generation cancelled'))
                if not self.active:continue
                rows,sample=batch_rows(list(self.active.values()),self.capacity)
                batch=self.batch.batch;batch.n_tokens=len(rows)
                for index,(token,position,slot,logits) in enumerate(rows):
                    batch.token[index]=token;batch.pos[index]=position;batch.seq_id[index][0]=slot;batch.n_seq_id[index]=1;batch.logits[index]=logits
                if not rows:continue
                self.ctx.decode(self.batch)
                for token,position,slot,_ in rows:self.active[slot]['evaluated'].append(token)
                for job in list(self.active.values()):
                    if job.get('prefill_boundary') and job['prefill_boundary']==job['prompt_offset'] and not job['checkpoint_saved']:
                        job['checkpoint_saved']=True;self.cache.capture(job['slot'],job['evaluated'],job['cache_scope'])
                        if job['remaining_boundaries']:job['prefill_boundary']=job['remaining_boundaries'].pop(0);job['checkpoint_saved']=False
                for job in list(self.active.values()):self._prefill_progress(job)
                self.decode_calls+=1;self.max_batch_sequences=max(self.max_batch_sequences,len(set(row[2] for row in rows)))
                for slot,index in sample.items():
                    job=self.active.get(slot)
                    if job is not None:self._sample(job,index)
        except Exception as error:
            with self.state_lock:self.closed=True
            for job in list(self.active.values()):self._finish(job,error=error)
        finally:
            for job in list(self.active.values()):self._finish(job,error=ValueError('Inference runtime closed'))
            with self.state_lock:
                self.closed=True
                remaining=[]
                while not self.pending.empty():remaining.append(self.pending.get_nowait())
            for job in remaining:
                if job is not None:
                    if hasattr(job['prompt'],'close'):job['prompt'].close()
                    job['out'].put(ValueError('Inference runtime closed'))
