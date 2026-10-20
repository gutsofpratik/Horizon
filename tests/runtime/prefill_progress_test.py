import sys,unittest,queue,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'runtime'/'models'))
from batched_decode import BatchedDecoder
class PrefillProgressTest(unittest.TestCase):
 def test_reports_processed_prompt_tokens_and_completion_without_fake_reasoning(self):
  decoder=BatchedDecoder.__new__(BatchedDecoder)
  job={'prompt':[1]*1024,'prompt_offset':128,'out':queue.Queue(),'prefill_started':time.monotonic()-1,'prefill_reported':0,'prefill_last_report':0}
  decoder._prefill_progress(job)
  event=job['out'].get_nowait()['openclaude_progress']
  self.assertEqual(event['phase'],'prefill');self.assertEqual(event['processedTokens'],128);self.assertEqual(event['promptTokens'],1024)
  decoder._prefill_progress(job);self.assertTrue(job['out'].empty())
  job['prompt_offset']=1024;decoder._prefill_progress(job)
  self.assertEqual(job['out'].get_nowait()['openclaude_progress']['processedTokens'],1024)
  decoder._prefill_progress(job);self.assertTrue(job['out'].empty())
unittest.main()
