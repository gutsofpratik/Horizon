import sys,unittest,torch
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'runtime'/'models'))
from qlora import completion_loss
class Dummy(torch.nn.Module):
 def __init__(self):super().__init__();self.weight=torch.nn.Parameter(torch.arange(20,dtype=torch.float32).reshape(5,4)/10);self.device=torch.device('cpu');self.kept=0
 def forward(self,input_ids,attention_mask,logits_to_keep,use_cache):self.kept=logits_to_keep;return type('Output',(),{'logits':self.weight[None,-logits_to_keep:,:]})()
class LossTest(unittest.TestCase):
 def test_answer_only_logits_match_normal_shifted_cross_entropy(self):
  model=Dummy();loss=completion_loss(model,[0,1,2,3,0],[-100,-100,-100,3,0]);expected=torch.nn.functional.cross_entropy(model.weight[2:4],torch.tensor([3,0]));torch.testing.assert_close(loss,expected);self.assertEqual(model.kept,3);loss.backward();self.assertIsNotNone(model.weight.grad);self.assertEqual(float(model.weight.grad[:2].abs().sum()),0)
unittest.main()
