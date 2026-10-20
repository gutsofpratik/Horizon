import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'runtime'/'models'))
from batch_plan import batch_rows
class BatchPlanTest(unittest.TestCase):
    def test_long_prefill_does_not_starve_a_decoding_response(self):
        jobs=[dict(slot=0,prompt=[1]*500,prompt_offset=0,position=0),dict(slot=1,prompt=[9],prompt_offset=1,position=12,next_token=7)]
        rows,sample=batch_rows(jobs,16,8)
        self.assertEqual(rows[0],(7,12,1,True));self.assertEqual(sample,{1:0})
        self.assertEqual(sum(row[2]==0 for row in rows),8)
    def test_idle_capacity_is_used_for_prompt_processing_without_starving_decode(self):
        jobs=[dict(slot=0,prompt=[1]*2048,prompt_offset=0,position=0),dict(slot=1,prompt=[9],prompt_offset=1,position=12,next_token=7)]
        rows,sample=batch_rows(jobs,512)
        self.assertEqual(len(rows),512)
        self.assertEqual(rows[0],(7,12,1,True));self.assertEqual(sample,{1:0})
        self.assertEqual(jobs[0]['prompt_offset'],511)
    def test_prefill_stops_exactly_at_recurrent_checkpoint_before_sampling(self):
        jobs=[dict(slot=0,prompt=list(range(1000)),prompt_offset=800,position=800,prefill_boundary=968)]
        rows,sample=batch_rows(jobs,512);self.assertEqual(len(rows),168);self.assertEqual(jobs[0]['prompt_offset'],968);self.assertEqual(sample,{})
        rows,sample=batch_rows(jobs,512);self.assertEqual(len(rows),32);self.assertEqual(sample,{0:31})
    def test_prefills_share_one_batch_and_keep_separate_sequence_ids(self):
        jobs=[dict(slot=i,prompt=[i+1]*2,prompt_offset=0,position=0) for i in range(2)]
        rows,sample=batch_rows(jobs,8)
        self.assertEqual(sample,{0:1,1:3});self.assertEqual([row[2] for row in rows],[0,0,1,1])
unittest.main()
