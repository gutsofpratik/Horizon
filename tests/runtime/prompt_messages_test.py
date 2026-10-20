import unittest,sys,copy
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'runtime/models'))
from prompt_messages import prepare_messages
from workspace_history import WorkspaceHistory

class PromptMessagesTest(unittest.TestCase):
 def test_new_schemas_and_tool_results_do_not_change_prior_prefix(self):
  history=WorkspaceHistory();base=[{'role':'system','content':'Policy\n\nLive workspace contextDate: today'},{'role':'user','content':'Make a plan'}]
  a=prepare_messages(copy.deepcopy(base),[{'name':'search'}],'chat',history)
  continuation=base+[{'role':'assistant','content':'','tool_calls':[{'id':'call','function':{'name':'search','arguments':'{}'}}]},{'role':'tool','content':'A real result','tool_call_id':'call'}]
  b=prepare_messages(copy.deepcopy(continuation),[{'name':'search'},{'name':'artifact'}],'chat',history)
  self.assertEqual(a,b[:len(a)])
  self.assertIn('artifact',b[-1]['content']);self.assertNotIn('artifact',b[0]['content'])
  following=continuation+[{'role':'assistant','content':'Done'},{'role':'user','content':'Improve it'}]
  c=prepare_messages(copy.deepcopy(following),[{'name':'search'}],'chat',history)
  self.assertEqual(b,c[:len(b)])
 def test_required_call_changes_live_constraint_not_system_policy(self):
  h=WorkspaceHistory();messages=[{'role':'system','content':'Policy'},{'role':'user','content':'Build'}];tools=[{'name':'artifact'}]
  a=prepare_messages(copy.deepcopy(messages),tools,'a',h)
  b=prepare_messages(copy.deepcopy(messages),tools,'b',h,True)
  self.assertEqual(a[0],b[0]);self.assertIn('required now',b[-1]['content'])
if __name__=='__main__':unittest.main()
