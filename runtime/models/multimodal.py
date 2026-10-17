"""MTMD image prefilling on the shared llama.cpp context; no server or remote fetches."""
import base64,ctypes,threading
from pathlib import Path

def resolve_projector(path,configured=None,layers=None):
    if configured:
        candidate=Path(configured).expanduser()
        if not candidate.is_absolute():candidate=Path(path).parent/candidate
        if not candidate.is_file():raise ValueError('Vision projector file does not exist: '+str(candidate))
        return str(candidate.resolve())
    for layer in layers or []:
        if layer.get('mediaType','').endswith('.projector'):
            candidate=Path(path).parent/layer['file']
            if not candidate.is_file():raise ValueError('Imported vision projector is missing: '+str(candidate))
            return str(candidate.resolve())
    matches=sorted(Path(path).parent.glob('*mmproj*.gguf'))
    return str(matches[0].resolve()) if len(matches)==1 else None

def inline_image(url):
    if not isinstance(url,str) or not url.startswith('data:image/') or ';base64,' not in url:raise ValueError('Vision inputs must be inline data:image base64 URLs; remote/file image URLs are not fetched by the model worker')
    try:raw=base64.b64decode(url.split(';base64,',1)[1],validate=True)
    except Exception as error:raise ValueError('Invalid base64 image input') from error
    if not raw or len(raw)>20*1024*1024:raise ValueError('Image input must be between 1 byte and 20 MiB')
    return raw

class VisionProjector:
    def __init__(self,model,path,use_gpu=True,image_max_tokens=2048):
        import llama_cpp.mtmd_cpp as mtmd
        self.api=mtmd;self.lock=threading.Lock();self.model=model
        params=mtmd.mtmd_context_params_default();params.use_gpu=use_gpu;params.n_threads=model.n_threads;params.print_timings=False;params.image_max_tokens=image_max_tokens
        self.ctx=mtmd.mtmd_init_from_file(path.encode(),model.model,params)
        if not self.ctx:raise ValueError('Cannot initialize the vision projector for this model')
        if not mtmd.mtmd_support_vision(self.ctx):self.close();raise ValueError('This projector does not support image input')
        model._stack.callback(self.close)
        self.marker=mtmd.mtmd_default_marker().decode()
    def close(self):
        if self.ctx:self.api.mtmd_free(self.ctx);self.ctx=None
    def messages(self,messages):
        converted=[];images=[]
        for message in messages:
            item=dict(message);content=item.get('content','')
            if isinstance(content,list):
                parts=[]
                for part in content:
                    if part.get('type')=='text':parts.append({'type':'text','text':part.get('text','')})
                    elif part.get('type')=='image_url':
                        value=part.get('image_url');url=value if isinstance(value,str) else value.get('url','')
                        images.append(inline_image(url));parts.append({'type':'text','text':self.marker})
                    else:raise ValueError('Unsupported multimodal content type: '+str(part.get('type')))
                item['content']=parts
            converted.append(item)
        if len(images)>16:raise ValueError('At most 16 images can be processed in one request')
        return converted,images
    def prepare(self,text,images,context):return MultimodalPrompt(self,text,images,context)

class MultimodalPrompt:
    def __init__(self,projector,text,images,context):
        self.projector=projector;self.chunks=None;self.bitmaps=[];api=projector.api
        # Tokenization and image preprocessing share projector state, separately from GPU decode.
        with projector.lock:
            try:
                for raw in images:
                    data=(ctypes.c_uint8*len(raw)).from_buffer_copy(raw)
                    bitmap=api.mtmd_helper_bitmap_init_from_buf(projector.ctx,data,len(raw),False)
                    if not bitmap:raise ValueError('The vision encoder could not decode an image')
                    self.bitmaps.append(bitmap)
                self.chunks=api.mtmd_input_chunks_init()
                encoded=text.encode('utf-8');input_text=api.mtmd_input_text();input_text.text=encoded;input_text.text_len=len(encoded);input_text.add_special=True;input_text.parse_special=True
                array=(api.mtmd_bitmap_p_ctypes*len(self.bitmaps))(*self.bitmaps)
                if api.mtmd_tokenize(projector.ctx,self.chunks,ctypes.byref(input_text),array,len(self.bitmaps))!=0:raise ValueError('Cannot tokenize the multimodal prompt with this model/projector')
                self.tokens=sum(api.mtmd_input_chunk_get_n_tokens(api.mtmd_input_chunks_get(self.chunks,index)) for index in range(api.mtmd_input_chunks_size(self.chunks)))
                self.positions=sum(api.mtmd_input_chunk_get_n_pos(api.mtmd_input_chunks_get(self.chunks,index)) for index in range(api.mtmd_input_chunks_size(self.chunks)))
                if max(self.positions,self.tokens)>=context:raise ValueError('Text and image tokens exceed the configured total context window')
            except Exception:self.close();raise
    def __len__(self):return max(self.positions,self.tokens)
    def evaluate(self,ctx,slot,batch,cancel):
        import llama_cpp
        api=self.projector.api;position=llama_cpp.llama_pos(0)
        try:
            with self.projector.lock:
                for index in range(api.mtmd_input_chunks_size(self.chunks)):
                    if cancel.is_set():raise ValueError('Generation cancelled')
                    chunk=api.mtmd_input_chunks_get(self.chunks,index);last=index==api.mtmd_input_chunks_size(self.chunks)-1
                    if api.mtmd_helper_eval_chunk_single(self.projector.ctx,ctx.ctx,chunk,position,llama_cpp.llama_seq_id(slot),batch,last,ctypes.byref(position))!=0:raise ValueError('Vision/text prefill failed in llama.cpp')
            return position.value
        finally:self.close()
    def close(self):
        api=self.projector.api
        if self.chunks:api.mtmd_input_chunks_free(self.chunks);self.chunks=None
        for bitmap in self.bitmaps:api.mtmd_bitmap_free(bitmap)
        self.bitmaps=[]
    def __del__(self):
        try:self.close()
        except Exception:pass
