import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'runtime'/'models'))
from inference_options import gpu_placements

class InferenceOptionsTest(unittest.TestCase):
    def test_long_context_keeps_gpu_and_quantizes_cache(self):
        choices=gpu_placements({},True,48,150000)
        self.assertEqual(choices[0],(-1,'q8_0'))
        self.assertTrue(all(layers!=0 for layers,_ in choices))
    def test_explicit_controls_are_preserved(self):
        self.assertEqual(gpu_placements({'device':'cuda','gpuLayers':32,'cacheType':'f16'},True,48,150000),[(32,'f16')])
        self.assertEqual(gpu_placements({'device':'cpu'},True,48,150000),[(0,'f16')])
    def test_cpu_is_used_when_no_gpu_exists(self):
        self.assertEqual(gpu_placements({},False,48,150000),[(0,'f16')])
    def test_balanced_memory_mode_has_gradual_offload_without_changing_context(self):
        choices=gpu_placements({'memoryMode':'balanced'},True,48,150000)
        self.assertEqual(choices[0],(-1,'q8_0'))
        self.assertIn((36,'q8_0'),choices);self.assertEqual(choices[-1],(0,'q8_0'))
        self.assertEqual(gpu_placements({'memoryMode':'balanced','gpuLayers':12},True,48,150000),[(12,'q8_0')])

unittest.main()
