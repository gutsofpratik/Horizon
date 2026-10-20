import unittest,sys,copy
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'runtime/models'))
from workspace_history import WorkspaceHistory
class WorkspaceHistoryTest(unittest.TestCase):
 def test_prior_context_stays_stable_while_latest_context_updates(self):
  cache=WorkspaceHistory();old=[{'role':'system','content':'policy'},{'role':'user','content':'Hello'}]
  first=cache.apply(copy.deepcopy(old),' first','chat')
  following=old+[{'role':'assistant','content':'Hi'},{'role':'user','content':'Next'}]
  second=cache.apply(copy.deepcopy(following),' second','chat')
  self.assertEqual(first[1],second[1]);self.assertIn(' second',second[-1]['content'])
  other=cache.apply(copy.deepcopy(following),' elsewhere','other');self.assertEqual(other[1]['content'],'Hello')
 def test_edits_and_memory_limits_do_not_reuse_incorrect_snapshots(self):
  cache=WorkspaceHistory(limit=8);cache.apply([{'role':'user','content':'One'}],'12345678','c');cache.apply([{'role':'user','content':'Two'}],'abcdefgh','c');self.assertLessEqual(cache.size,8)
  changed=cache.apply([{'role':'user','content':'Changed'},{'role':'user','content':'Current'}],'new','c');self.assertEqual(changed[0]['content'],'Changed');cache.clear();self.assertEqual(cache.size,0)
 def test_identical_workspace_is_not_repeated_and_eviction_restores_full_context(self):
  cache=WorkspaceHistory();first=[{'role':'user','content':'One'}];cache.apply(copy.deepcopy(first),'Date: today\n\nName: Mira','c')
  second=first+[{'role':'assistant','content':'Hello'},{'role':'user','content':'Two'}]
  rendered=cache.apply(copy.deepcopy(second),'Date: today\n\nName: Mira','c');self.assertEqual(rendered[-1]['content'],'Two')
  cache.entries.pop(next(iter(cache.entries)))
  refreshed=cache.apply(copy.deepcopy(second),'Date: today\n\nName: Mira','c');self.assertIn('Name: Mira',refreshed[-1]['content'])
if __name__=='__main__':unittest.main()
