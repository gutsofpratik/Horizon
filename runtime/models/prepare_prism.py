"""Prepare isolated bindings for Prism e3de71522; never replace the stock wheel/DLLs."""
import ast,ctypes,hashlib,json,os,shutil,sys,subprocess
from pathlib import Path

def prepare(directory,package):
    directory=Path(directory).resolve();package=Path(package).resolve()
    dll=directory/'bin'/'llama.dll'
    version=subprocess.run([str(directory/'bin'/'llama-cli.exe'),'--version'],capture_output=True,text=True,check=True)
    if 'e3de71522' not in version.stdout+version.stderr:raise ValueError('Only Prism build e3de71522 is supported by these bindings')
    if '__version__ = "0.3.36"' not in (package/'__init__.py').read_text():raise ValueError('Expected llama-cpp-python 0.3.36 binding sources')
    handle=os.add_dll_directory(str(dll.parent))
    lib=ctypes.CDLL(str(dll))
    source=(package/'llama_cpp.py').read_text(encoding='utf-8')
    tree=ast.parse(source)
    # These newer APIs are not used by Horizon's decoder. Calling one fails explicitly.
    optional={'llama_adapter_lora_init_from_file_ptr','llama_process','llama_get_causal_attn'}
    optional.update('llama_batch_ext_'+name for name in ('init','free','clear','add','add_token','add_embd','add_seq','set_embd_token','set_embd_state','set_output_embd','set_output_logits','set_pos'))
    missing=[]
    for node in tree.body:
        if not isinstance(node,ast.FunctionDef):continue
        for decorator in node.decorator_list:
            if not isinstance(decorator,ast.Call) or not isinstance(decorator.func,ast.Name) or decorator.func.id!='ctypes_function':continue
            name=decorator.args[0].value
            if not hasattr(lib,name):
                if name not in optional:raise ValueError('Prism ABI missing required function: '+name)
                node.decorator_list=[]
                node.body=ast.parse('raise NotImplementedError('+repr('Not available in Prism e3de71522: '+name)+')').body
                missing.append(name)
    for node in tree.body:
        if not isinstance(node,ast.ClassDef) or node.name not in ('llama_model_params','llama_context_params'):continue
        fields=next(item for item in node.body if isinstance(item,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='_fields_' for t in item.targets)).value.elts
        if node.name=='llama_model_params':
            fields[:]=[f for f in fields if f.elts[0].value!='lazy_mode']
            fields.insert(0,ast.parse("('dspark_head_source',ctypes.c_void_p)",mode='eval').body)
        else:
            index=next(i for i,f in enumerate(fields) if f.elts[0].value=='abort_callback')
            fields.insert(index,ast.parse("('path_kv_mean_center',ctypes.c_char_p)",mode='eval').body)
    destination=directory/'bindings'/'llama_cpp'
    if destination.exists():raise ValueError('Prism bindings already exist; use a new installation directory')
    shutil.copytree(package,destination,ignore=shutil.ignore_patterns('lib','__pycache__'))
    (destination/'llama_cpp.py').write_text(ast.unparse(ast.fix_missing_locations(tree)),encoding='utf-8')
    # MTMD exports differ too. Unsupported optional APIs fail on use, never return fake results.
    mtmd=destination/'mtmd_cpp.py'
    text=mtmd.read_text(encoding='utf-8').replace('ctypes_function = ctypes_function_for_shared_library(_libmtmd)', '''_bind = ctypes_function_for_shared_library(_libmtmd)
def ctypes_function(name,argtypes,restype,enabled=True):
    if hasattr(_libmtmd,name):return _bind(name,argtypes,restype,enabled)
    def decorate(f):
        def unavailable(*args,**kwargs):raise NotImplementedError('Prism MTMD API unavailable: '+name)
        return unavailable
    return decorate''')
    # Fork helper signatures predate the new init_opt argument. Bind their exact ABI.
    text+='''
_prism_bitmap_buf = _bind('mtmd_helper_bitmap_init_from_buf', [mtmd_context_p_ctypes, POINTER(c_uint8), c_size_t, c_bool], mtmd_helper_bitmap_wrapper)(lambda:None)
_prism_bitmap_file = _bind('mtmd_helper_bitmap_init_from_file', [mtmd_context_p_ctypes, c_char_p, c_bool], mtmd_helper_bitmap_wrapper)(lambda:None)
def mtmd_helper_bitmap_init_from_buf(ctx,buf,length,placeholder):
    return _prism_bitmap_buf(ctx,buf,length,placeholder).bitmap
def mtmd_helper_bitmap_init_from_file(ctx,path,placeholder):
    return _prism_bitmap_file(ctx,path,placeholder).bitmap
'''
    mtmd.write_text(text,encoding='utf-8')
    (directory/'binding-manifest.json').write_text(json.dumps({'commit':'e3de71522','bindingVersion':'0.3.36','llamaSha256':hashlib.sha256(dll.read_bytes()).hexdigest(),'missingUnusedApis':missing},indent=2),encoding='utf-8')

if __name__=='__main__':prepare(sys.argv[1],sys.argv[2])
