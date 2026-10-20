import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'runtime'/'models'))
from memory_plan import parallel_capacity,MIB
class MemoryPlanTest(unittest.TestCase):
    def test_slots_are_limited_by_actual_free_memory_after_weight_loading(self):
        before=[{'index':0,'total':12000,'free':11000}]
        after=[{'index':0,'total':12000,'free':3000}]
        self.assertEqual(parallel_capacity(None,before,after,6000*MIB,150000),2)
        self.assertEqual(parallel_capacity(1,before,after,6000*MIB,150000),1)
        self.assertEqual(parallel_capacity(8,before,[{**after[0],'free':900}],6000*MIB,150000),1)
    def test_automatic_mode_is_conservative_without_device_telemetry(self):
        self.assertEqual(parallel_capacity(None,[],[],0,150000),1)
unittest.main()
