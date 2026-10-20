import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'runtime'/'models'))
from tool_envelope import tool_envelope
from sampling_schema import sampling_schema
class ToolEnvelopeTest(unittest.TestCase):
    def test_required_call_cannot_be_replaced_by_prose_or_empty_array(self):
        tool={'type':'function','function':{'name':'artifact_create','parameters':{'type':'object','properties':{'source':{'type':'string','maxLength':500000}},'required':['source']}}}
        schema=sampling_schema(tool_envelope([tool],True,True))
        self.assertEqual(schema['properties']['content'],{'const':''});self.assertIn('tool_call',schema['required']);self.assertNotIn('tool_calls',schema['properties']);self.assertEqual(schema['properties']['tool_call']['anyOf'][0]['properties']['name'],{'const':'artifact_create'})
        with self.assertRaises(ValueError):tool_envelope([],False,True)
    def test_recursive_function_schema_references_are_rebased_under_the_envelope(self):
        tool={'function':{'name':'toolkit','parameters':{'type':'object','properties':{'arguments':{'$ref':'#/$defs/json'}},'$defs':{'json':{'anyOf':[{'type':'string'},{'type':'array','items':{'$ref':'#/$defs/json'}}]}}}}}
        schema=tool_envelope([tool])
        root=schema['$defs']['tool-0']
        self.assertEqual(root['properties']['arguments']['$ref'],'#/$defs/tool-0/$defs/json')
        self.assertEqual(root['$defs']['json']['anyOf'][1]['items']['$ref'],'#/$defs/tool-0/$defs/json')
        self.assertEqual(schema['properties']['tool_calls']['items']['anyOf'][0]['properties']['arguments']['$ref'],'#/$defs/tool-0')
unittest.main()
