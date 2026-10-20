import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'runtime/models'))
from native_tools import NativeToolStream,parse_native_calls,detect_protocol,render_native_call,decode_native_calls
TOOLS=[{'function':{'name':'calculate','parameters':{'type':'object','properties':{'expression':{'type':'string'},'precision':{'type':'integer'}}}}}]
class NativeToolsTest(unittest.TestCase):
 def test_native_format_detected_and_plain_answer_streamed(self):
  self.assertEqual(detect_protocol('<tool_call><function=x><parameter=a>'),'qwen_xml')
  self.assertEqual(detect_protocol('other template'),'envelope')
  parser=NativeToolStream();text='Hello! '+render_native_call('calculate',{'expression':'2+2','precision':2})
  visible=''.join(parser.feed(text[i:i+2]) for i in range(0,len(text),2))+parser.flush()
  self.assertEqual(visible,'Hello! ')
  self.assertEqual(parse_native_calls(text,TOOLS),[{'name':'calculate','arguments':{'expression':'2+2','precision':2}}])
 def test_malformed_unknown_and_duplicate_calls_cannot_execute(self):
  for text in ['<tool_call><function=calculate>','<tool_call><function=unknown></function></tool_call>','<tool_call><function=calculate><parameter=precision>not a number</parameter></function></tool_call>','<tool_call><function=calculate><parameter=expression>a</parameter><parameter=expression>b</parameter></function></tool_call>']:
   with self.assertRaises(ValueError):parse_native_calls(text,TOOLS)
 def test_tool_arguments_stay_hidden_and_plain_text_remains_plain(self):
  parser=NativeToolStream();self.assertEqual(parser.feed('Hello world')+parser.flush(),'Hello world')
  self.assertEqual(parse_native_calls('Hello world',TOOLS),[])
 def test_gateway_json_fences_and_multiline_strings_preserve_values(self):
  tools=[{'function':{'name':'toolkit','parameters':{'properties':{'arguments':{'type':'object'}}}}}]
  for value in ['```json\n{"url":"https://example.com"}\n```','{"text":"line one\nline two"}']:
   text='<tool_call><function=toolkit><parameter=arguments>'+value+'</parameter></function></tool_call>'
   call=parse_native_calls(text,tools)[0]
   self.assertIsInstance(call['arguments']['arguments'],dict)
  self.assertEqual(call['arguments']['arguments']['text'],'line one\nline two')
 def test_malformed_gateway_arguments_return_a_nonexecuting_validation_call(self):
  tools=[{'function':{'name':'toolkit','parameters':{'properties':{'arguments':{'type':'object'}}}}}]
  calls=decode_native_calls('<tool_call><function=toolkit><parameter=arguments>{bad json}</parameter></function></tool_call>',tools)
  self.assertEqual(calls[0]['name'],'toolkit');self.assertEqual(calls[0]['arguments'],{})
  self.assertIn('arguments',calls[0]['argument_error']);self.assertIn('JSON',calls[0]['argument_error'])
 def test_only_a_completed_function_can_restore_an_omitted_outer_wrapper(self):
  text=render_native_call('calculate',{'expression':'2+2'})
  completed=decode_native_calls(text.removesuffix('</tool_call>'),TOOLS)
  self.assertEqual(completed[0]['arguments'],{'expression':'2+2'})
  self.assertNotIn('argument_error',completed[0])
  for partial in ['<tool_call><function=calculate><parameter=expression>2+', '<tool_call><function=calculate><parameter=expression>2+2</parameter>']:
   rejected=decode_native_calls(partial,TOOLS)[0]
   self.assertEqual(rejected['arguments'],{})
   self.assertIn('argument_error',rejected)
 def test_complete_json_transport_inside_a_wrapper_is_valid_but_prose_is_not_executable(self):
  text='<tool_call>{"name":"calculate","arguments":{"expression":"2+2"}}</tool_call>'
  self.assertEqual(parse_native_calls(text,TOOLS)[0]['arguments'],{'expression':'2+2'})
  self.assertEqual(parse_native_calls('{"name":"calculate","arguments":{"expression":"2+2"}}',TOOLS),[])
  for body in ['{"name":"unknown","arguments":{}}','{"name":"calculate","arguments":"partial"}','{"name":"calculate","arguments":{"expression":"2+2"}']:
   self.assertIn('argument_error',decode_native_calls('<tool_call>'+body+'</tool_call>',TOOLS)[0])
 def test_complete_jsonl_call_records_are_atomic_and_parameters_remain_one_value(self):
  first='{"name":"calculate","arguments":{"expression":"2+2"}}'
  second='{"name":"calculate","arguments":{"expression":"3+3"}}'
  calls=parse_native_calls('<tool_call>'+first+'\n'+second+'</tool_call>',TOOLS)
  self.assertEqual([call['arguments']['expression'] for call in calls],['2+2','3+3'])
  self.assertEqual(parse_native_calls(first+'\n'+second,TOOLS),[])
  for suffix in ['{"name":"unknown","arguments":{}}','{"name":"calculate","arguments":','trailing prose',first.replace('"name":"calculate"','"name":"calculate","name":"calculate"')]:
   rejected=decode_native_calls('<tool_call>'+first+'\n'+suffix+'</tool_call>',TOOLS)
   self.assertEqual(len(rejected),1);self.assertIn('argument_error',rejected[0]);self.assertEqual(rejected[0]['arguments'],{})
  tools=[{'function':{'name':'toolkit','parameters':{'properties':{'arguments':{'type':'object'}}}}}]
  rejected=decode_native_calls('<tool_call><function=toolkit><parameter=arguments>{"a":1}\n{"b":2}</parameter></function></tool_call>',tools)
  self.assertIn('Multiple JSON values in one parameter',rejected[0]['argument_error'])
if __name__=='__main__':unittest.main()
