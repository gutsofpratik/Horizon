import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'runtime'/'models'))
from qlora import completion_window
class WindowTest(unittest.TestCase):
 def test_completion_loss_uses_only_targets_and_one_preceding_logit(self):
  self.assertEqual(completion_window([-100,-100,7,8,9]),(4,[7,8,9]))
  with self.assertRaises(ValueError):completion_window([-100,-100])
  with self.assertRaises(ValueError):completion_window([-100,7,-100,8])
unittest.main()
