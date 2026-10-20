import unittest,sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'runtime'/'models'))
from model_messages import template_history
class HistoryTest(unittest.TestCase):
 def test_old_native_tool_calls_are_retained_as_text_even_without_current_tools(self):
  source=[{'role':'assistant','content':'Opening','tool_calls':[{'function':{'name':'browser_open_file','arguments':'{"path":"slides.html"}'}}]},{'role':'tool','content':'{"tab_id":"saved-tab"}','tool_call_id':'call'}]
  result=template_history(source)
  self.assertNotIn('tool_calls',result[0]);self.assertIn('slides.html',result[0]['content']);self.assertEqual(result[1]['role'],'user');self.assertIn('saved-tab',result[1]['content']);self.assertIn('tool_calls',source[0]);self.assertEqual(source[1]['role'],'tool')
 def test_qwen_history_preserves_native_syntax_instead_of_json_envelope(self):
  from native_tools import parse_native_calls
  tools=[{'function':{'name':'toolkit','parameters':{'properties':{'action':{'type':'string'},'name':{'type':'string'},'arguments':{'type':'object'}}}}}]
  source=[{'role':'assistant','content':'Opening','tool_calls':[{'function':{'name':'toolkit','arguments':json.dumps({'action':'call','name':'browser_open','arguments':{'url':'https://example.com'}})}}]}]
  result=template_history(source,'qwen_xml')
  self.assertNotIn('Tool calls:',result[0]['content'])
  self.assertEqual(parse_native_calls(result[0]['content'],tools)[0]['arguments']['name'],'browser_open')
 def test_invalid_requests_are_not_replayed_as_empty_function_examples(self):
  source=[{'role':'assistant','tool_calls':[{'id':'bad','function':{'name':'toolkit','arguments':'{}'}}]},{'role':'tool','tool_call_id':'bad','content':json.dumps({'status':'failed','error':{'code':'INVALID_ARGUMENTS','message':'action is required'}})}]
  for protocol in ['qwen_xml','envelope']:
   result=template_history(source,protocol)
   self.assertNotIn('<function=toolkit>',result[0]['content'])
   self.assertNotIn('Tool calls:',result[0]['content'])
   self.assertIn('failed validation',result[0]['content'])
   self.assertIn('action is required',result[1]['content'])
unittest.main()
