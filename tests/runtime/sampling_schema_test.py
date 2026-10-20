import sys,os,json,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'runtime'/'models'))
from sampling_schema import sampling_schema

class SamplingSchemaTest(unittest.TestCase):
    def test_large_artifact_limits_do_not_expand_native_grammar(self):
        original={'type':'object','properties':{'source':{'type':'string','maxLength':500000},'maxLength':{'type':'integer'},'items':{'type':'array','maxItems':100000,'items':{'type':'string','pattern':'(a*)*'}}},'required':['source'],'additionalProperties':False}
        sampled=sampling_schema(original)
        self.assertEqual(sampled['properties']['source'],{'type':'string'})
        self.assertEqual(sampled['properties']['items'],{'type':'array','items':{'type':'string'}})
        self.assertIn('maxLength',sampled['properties'])
        self.assertEqual(sampled['required'],['source'])
        self.assertFalse(sampled['additionalProperties'])
        self.assertEqual(original['properties']['source']['maxLength'],500000)
    def test_preserves_enums_constants_and_required_arguments(self):
        schema={'anyOf':[{'type':'object','properties':{'name':{'const':'artifact_create'},'kind':{'enum':['html','code']}},'required':['name','kind']}]}
        self.assertEqual(sampling_schema(schema),schema)
    def test_recursive_definition_names_are_valid_unique_grammar_identifiers(self):
        from tool_envelope import tool_envelope
        tools=[{'function':{'name':name,'parameters':{'$ref':'#/$defs/__schema0','$defs':{'__schema0':{'anyOf':[{'type':'string'},{'type':'array','items':{'$ref':'#/$defs/__schema0'}}]}}}}} for name in ['first','second']]
        schema=sampling_schema(tool_envelope(tools))
        encoded=json.dumps(schema)
        self.assertNotIn('__schema0',encoded)
        names=[]
        def visit(node):
            if isinstance(node,dict):
                for key,value in node.items():
                    if key=='$defs':names.extend(value)
                    visit(value)
            elif isinstance(node,list):
                for item in node:visit(item)
        visit(schema)
        self.assertEqual(len(names),len(set(names)))
        for name in names:self.assertRegex(name,r'^[a-z][a-z0-9-]*$')
    def test_rejects_excessive_schema_depth_before_native_parser(self):
        schema={'type':'string'}
        for _ in range(100):schema={'type':'array','items':schema}
        with self.assertRaisesRegex(ValueError,'deep'):sampling_schema(schema)
    @unittest.skipUnless(os.environ.get('OPENCLAUDE_TEST_GGUF'),'Set OPENCLAUDE_TEST_GGUF for the native grammar regression')
    def test_native_parser_accepts_large_artifact_field_limits(self):
        import native_worker,llama_cpp
        from tool_envelope import tool_envelope
        from native_sampler import add_grammar
        schema={'type':'object','properties':{'source':{'type':'string','maxLength':500000}},'required':['source'],'additionalProperties':False}
        recursive={'anyOf':[{'type':'string'},{'type':'array','items':{'$ref':'#/$defs/__schema0'}},{'type':'object','additionalProperties':{'$ref':'#/$defs/__schema0'}}]}
        recovery=tool_envelope([{'function':{'name':'toolkit','parameters':{'oneOf':[{'type':'object','properties':{'action':{'const':'discover'}}},{'type':'object','properties':{'action':{'const':'call'},'arguments':{'type':'object','additionalProperties':{'$ref':'#/$defs/__schema0'}}}}],'$defs':{'__schema0':recursive}}}}])
        params=llama_cpp.llama_model_default_params();params.vocab_only=True
        model=llama_cpp.llama_model_load_from_file(os.environ['OPENCLAUDE_TEST_GGUF'].encode(),params)
        self.assertTrue(model)
        try:
            from types import SimpleNamespace
            from llama_cpp import _internals
            for candidate in [schema,recovery]:
                grammar=llama_cpp.LlamaGrammar.from_json_schema(json.dumps(sampling_schema(candidate)),verbose=False)
                self.assertLess(len(grammar._grammar),10000)
                chain=_internals.LlamaSampler()
                try:add_grammar(chain,SimpleNamespace(vocab=llama_cpp.llama_model_get_vocab(model)),grammar)
                finally:chain.close()
        finally:
            llama_cpp.llama_model_free(model)

unittest.main()
