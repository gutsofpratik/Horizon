import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'runtime/models'))
from auto_context import automatic_context
class AutoContextTest(unittest.TestCase):
 def test_explicit_context_is_never_changed(self):self.assertEqual(automatic_context({'contextTokens':150000},262144,{},9*1024**3,1024**3),150000)
 def test_auto_fit_obeys_floor_native_and_memory(self):
  self.assertEqual(automatic_context({'minimumContext':4096},2048,{},100,0),2048)
  self.assertEqual(automatic_context({'minimumContext':4096},262144,{},9*1024**3,10*1024**3),4096)
  self.assertGreater(automatic_context({},262144,{},1024**3,10*1024**3),4096)
  self.assertEqual(automatic_context({'autoFitContext':False,'minimumContext':8192},262144,{},0,10**12),8192)
if __name__=='__main__':unittest.main()
