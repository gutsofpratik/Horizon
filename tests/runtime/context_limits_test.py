import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'runtime'/'models'))
from context_limits import check_context_capacity,response_budget,generation_budget
class ContextLimitsTest(unittest.TestCase):
    def test_accepts_native_alignment_without_changing_user_limit(self):
        self.assertEqual(check_context_capacity(100000,100096),100000)
        self.assertEqual(check_context_capacity(150000,150016),150000)
    def test_rejects_reduced_context(self):
        with self.assertRaisesRegex(ValueError,'no context reduction'):
            check_context_capacity(150000,8192)
    def test_output_is_a_ceiling_not_a_fixed_reservation(self):
        self.assertEqual(response_budget(100000,99000,18000),82000)
        self.assertEqual(response_budget(150000,4096,18000),4096)
        self.assertEqual(response_budget(150000,4096,18000,32),32)
        with self.assertRaisesRegex(ValueError,'Input'):
            response_budget(100000,99000,100000)
    def test_active_generation_stops_at_compaction_threshold_without_shrinking_context(self):
        self.assertEqual(generation_budget(60000,60000,50000,None,True),(4000,True))
        self.assertEqual(generation_budget(60000,60000,50000,128,True),(128,False))
        self.assertEqual(generation_budget(60000,60000,50000,None,False),(10000,False))
unittest.main()
