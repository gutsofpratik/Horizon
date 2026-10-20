import sys,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock,patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'runtime'/'models'))
from native_sampler import add_grammar

class NativeSamplerTest(unittest.TestCase):
    def test_rejected_grammar_never_enters_native_chain(self):
        api=SimpleNamespace(llama_sampler_init_grammar=Mock(return_value=None),llama_sampler_chain_add=Mock(),llama_sampler_free=Mock())
        with patch.dict(sys.modules,{'llama_cpp':api}):
            with self.assertRaisesRegex(ValueError,'rejected'):add_grammar(SimpleNamespace(sampler=1),SimpleNamespace(vocab=2),SimpleNamespace(_grammar='bad',_root='root'))
        api.llama_sampler_chain_add.assert_not_called()
        api.llama_sampler_free.assert_not_called()
    def test_accepted_grammar_is_owned_by_chain(self):
        api=SimpleNamespace(llama_sampler_init_grammar=Mock(return_value=3),llama_sampler_chain_add=Mock(),llama_sampler_free=Mock())
        with patch.dict(sys.modules,{'llama_cpp':api}):add_grammar(SimpleNamespace(sampler=1),SimpleNamespace(vocab=2),SimpleNamespace(_grammar='root ::= "x"',_root='root'))
        api.llama_sampler_chain_add.assert_called_once_with(1,3)
        api.llama_sampler_free.assert_not_called()

unittest.main()
