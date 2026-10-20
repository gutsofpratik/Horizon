import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'runtime'/'models'))
from train_lora import encode_example
class Tokenizer:
 def apply_chat_template(self,messages,tokenize=False,add_generation_prompt=False,**kwargs):return ''.join('<'+m['role']+'>'+m['content'] for m in messages)+('<assistant>' if add_generation_prompt else '')
 def encode(self,text,add_special_tokens=False):return list(text.encode())
class TrainingTest(unittest.TestCase):
 def test_only_assistant_completion_is_supervised(self):
  ids,labels=encode_example(Tokenizer(),{'id':'one','messages':[{'role':'system','content':'policy'},{'role':'user','content':'hi'},{'role':'assistant','content':'hello'}]},256)
  self.assertEqual(labels[-5:],list(b'hello'));self.assertTrue(all(value==-100 for value in labels[:-5]));self.assertEqual(len(ids),len(labels))
 def test_long_example_is_rejected_instead_of_losing_its_training_target(self):
  with self.assertRaisesRegex(ValueError,'never truncate'):encode_example(Tokenizer(),{'id':'long','messages':[{'role':'user','content':'x'*100},{'role':'assistant','content':'answer'}]},20)
unittest.main()
