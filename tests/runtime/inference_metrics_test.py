import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'runtime'/'models'))
from inference_metrics import inference_metrics
from inference_options import flash_attention,gpu_placements,loading_attempts
class MetricsTest(unittest.TestCase):
 def test_prompt_cache_and_generated_tokens_have_separate_timings(self):
  usage=inference_metrics({'prompt':[0]*1000,'cached_tokens':800,'generated':50,'prefill_started':10,'prefill_completed':10.5},12.5)
  self.assertEqual(usage['prompt_tokens'],1000);self.assertEqual(usage['completion_tokens'],50);self.assertEqual(usage['prompt_eval_tokens'],200);self.assertEqual(usage['prompt_tokens_details']['cached_tokens'],800);self.assertEqual(usage['prompt_tokens_per_second'],400);self.assertEqual(usage['generation_tokens_per_second'],25)
 def test_flash_controls_respect_gpu_and_explicit_choices(self):
  self.assertTrue(flash_attention({},-1));self.assertFalse(flash_attention({},0));self.assertFalse(flash_attention({'flashAttention':'off'},-1));self.assertTrue(flash_attention({'flashAttention':'on'},-1))
  with self.assertRaises(ValueError):flash_attention({'flashAttention':'on'},0)
  self.assertEqual(gpu_placements({'flashAttention':'off','gpuLayers':-1},True,48,60000),[(-1,'f16')])
  with self.assertRaises(ValueError):gpu_placements({'flashAttention':'off','cacheType':'q4_0'},True,48,60000)
  self.assertEqual(list(loading_attempts({},[(-1,'q8_0')])),[(-1,'q8_0',True),(-1,'f16',False)])
  self.assertEqual(list(loading_attempts({'flashAttention':'on'},[(-1,'q8_0')])),[(-1,'q8_0',True)])
  self.assertEqual(list(loading_attempts({'cacheType':'q4_0'},[(-1,'q4_0')])),[(-1,'q4_0',True)])
unittest.main()
