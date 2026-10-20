import unittest,sys,tempfile,ctypes
from pathlib import Path
from contextlib import ExitStack
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'runtime'/'models'))
from lora import apply_adapters
class Native:
 llama_adapter_lora_p_ctypes=ctypes.c_void_p
 def __init__(self):self.freed=[];self.set=[]
 def llama_adapter_lora_init(self,model,path):return 42 if path.endswith(b'valid.gguf') else None
 def llama_set_adapters_lora(self,ctx,adapters,count,scales):self.set.append((ctx,count,list(scales)));return 0
 def llama_adapter_lora_free(self,pointer):self.freed.append(pointer)
class Model:
 def __init__(self):self._model=type('Weights',(),{'model':1})();self._stack=ExitStack()
class AdapterTest(unittest.TestCase):
 def test_native_adapter_is_applied_to_final_batch_context_and_freed(self):
  native=Native();model=Model()
  with tempfile.TemporaryDirectory() as folder:
   path=Path(folder,'valid.gguf');path.write_bytes(b'GGUF')
   result=apply_adapters(native,model,99,[{'path':str(path),'scale':.5},{'path':'disabled.gguf','enabled':False}])
   self.assertEqual(native.set,[(99,1,[.5])]);self.assertEqual(result[0]['scale'],.5);model._stack.close();self.assertEqual(native.freed,[42])
 def test_failure_cannot_silently_run_without_requested_adapter(self):
  with tempfile.TemporaryDirectory() as folder:
   path=Path(folder,'wrong.gguf');path.write_bytes(b'GGUF');model=Model()
   with self.assertRaisesRegex(ValueError,'incompatible|initialize'):apply_adapters(Native(),model,99,[{'path':str(path)}])
   path.write_bytes(b'not-adapter')
   with self.assertRaisesRegex(ValueError,'GGUF'):apply_adapters(Native(),model,99,[{'path':str(path)}])
unittest.main()
