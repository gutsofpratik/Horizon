import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'runtime'/'models'))
from prompt_cache import PromptCache
class Context:
 def __init__(self):self.removed=[];self.fail=False
 def kv_cache_seq_rm(self,slot,start,end):self.removed.append((slot,start,end));return not self.fail or start==0
class State:
 def __init__(self):self.saved=[];self.restored=[];self.size=16;self.fail=False
 def save(self,slot):self.saved.append(slot);return b'x'*self.size
 def restore(self,slot,data):self.restored.append((slot,data));return not self.fail
class CacheTest(unittest.TestCase):
 def test_transformer_reuses_exact_prefix_and_rewinds_one_token_for_logits(self):
  ctx=Context();cache=PromptCache(ctx,None);cache.finish(0,list(range(100)),'chat')
  self.assertEqual(cache.begin(0,list(range(100))+[101],'chat'),100)
  cache.finish(0,list(range(100)),'chat');self.assertEqual(cache.begin(0,list(range(100)),'chat'),99)
  self.assertEqual(ctx.removed[-1],(0,99,-1))
 def test_recurrent_restores_checkpoint_before_trimming_kv_not_arbitrary_rewind(self):
  ctx=Context();state=State();cache=PromptCache(ctx,state);tokens=list(range(100));cache.capture(0,tokens[:68],'chat');cache.finish(0,tokens+[123],'chat')
  self.assertEqual(cache.begin(0,tokens+[8],'chat'),68);self.assertEqual(state.restored,[(0,b'x'*16)]);self.assertEqual(ctx.removed[-1],(0,68,-1))
 def test_scope_edits_errors_and_unrestorable_state_cannot_reuse_other_content(self):
  for scope,prompt in [('other',list(range(110))),('chat',[999]+list(range(100)))]:
   ctx=Context();state=State();cache=PromptCache(ctx,state);cache.capture(0,list(range(68)),'chat');cache.finish(0,list(range(100)),'chat');self.assertEqual(cache.begin(0,prompt,scope),0)
  state=State();ctx=Context();cache=PromptCache(ctx,state);cache.capture(0,list(range(68)),'chat');cache.finish(0,list(range(100)),'chat');state.fail=True;self.assertEqual(cache.begin(0,list(range(110)),'chat'),0);self.assertEqual(ctx.removed[-1],(0,0,-1))
 def test_checkpoint_budget_and_abort_clear_private_state(self):
  ctx=Context();state=State();cache=PromptCache(ctx,state,byte_limit=8);self.assertFalse(cache.capture(0,list(range(68)),'chat'));cache.finish(0,list(range(100)),'chat');self.assertEqual(cache.begin(0,list(range(110)),'chat'),0)
  cache=PromptCache(ctx,state);cache.capture(0,list(range(68)),'chat');cache.finish(0,list(range(100)),'chat');cache.discard(0);self.assertEqual(cache.entries,{});self.assertEqual(cache.checkpoints,{})
 def test_slot_selection_prefers_the_matching_conversation_without_crossing_active_slots(self):
  cache=PromptCache(Context(),None);cache.finish(1,list(range(100)),'chat');self.assertEqual(cache.choose([0,1],list(range(110)),'chat'),1);self.assertEqual(cache.choose([0],list(range(110)),'chat'),0)
 def test_tool_schema_changes_fall_back_to_policy_checkpoint(self):
  cache=PromptCache(Context(),State());tokens=list(range(100));cache.capture(0,tokens[:30],'chat');cache.capture(0,tokens[:68],'chat');cache.finish(0,tokens,'chat')
  changed=tokens[:40]+[999]*60
  self.assertEqual(cache.begin(0,changed,'chat'),30)
  self.assertEqual([item['position'] for item in cache.checkpoints[0]],[30])
 def test_memory_limit_keeps_the_policy_checkpoint_when_tool_checkpoint_cannot_fit(self):
  cache=PromptCache(Context(),State(),byte_limit=20);self.assertTrue(cache.capture(0,list(range(30)),'chat'));self.assertFalse(cache.capture(0,list(range(68)),'chat'));cache.finish(0,list(range(100)),'chat');self.assertEqual(cache.begin(0,list(range(110)),'chat'),30)
unittest.main()
