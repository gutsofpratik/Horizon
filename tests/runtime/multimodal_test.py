import sys,unittest,tempfile,base64
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'runtime'/'models'))
from multimodal import resolve_projector,inline_image
from reasoning_stream import ReasoningStream
class MultimodalTest(unittest.TestCase):
    def test_imported_projector_and_explicit_override(self):
        with tempfile.TemporaryDirectory() as root:
            model=Path(root,'model.gguf');model.touch();projector=Path(root,'projector.blob');projector.touch()
            self.assertEqual(resolve_projector(model,layers=[{'mediaType':'application/vnd.ollama.image.projector','file':'projector.blob'}]),str(projector.resolve()))
            self.assertEqual(resolve_projector(model,'projector.blob'),str(projector.resolve()))
            with self.assertRaisesRegex(ValueError,'does not exist'):resolve_projector(model,'missing.gguf')
    def test_ambiguous_adjacent_projectors_need_explicit_choice(self):
        with tempfile.TemporaryDirectory() as root:
            model=Path(root,'model.gguf');model.touch()
            Path(root,'mmproj-a.gguf').touch();Path(root,'mmproj-b.gguf').touch()
            self.assertIsNone(resolve_projector(model))
    def test_worker_never_fetches_remote_images_or_reads_arbitrary_files(self):
        self.assertEqual(inline_image('data:image/png;base64,'+base64.b64encode(b'pixels').decode()),b'pixels')
        for value in ['http://127.0.0.1/secret','file:///secret','data:image/png;base64,%%%']:
            with self.assertRaises(ValueError):inline_image(value)
    def test_native_reasoning_boundary_is_split_safely_from_json(self):
        text='Reasoning about a task.</think>\n{"content":"Answer","tool_calls":[]}'
        for width in range(1,20):
            parser=ReasoningStream(True);reason=[];answer=[]
            for offset in range(0,len(text),width):
                result=parser.feed(text[offset:offset+width]);reason.append(result['reasoning']);answer.append(result['content'])
            self.assertEqual(''.join(reason),'Reasoning about a task.');self.assertEqual(''.join(answer),'\n{"content":"Answer","tool_calls":[]}');self.assertFalse(parser.active)
    def test_plain_text_is_not_labelled_reasoning(self):
        parser=ReasoningStream(False);self.assertEqual(parser.feed('Hello'),{'reasoning':'','content':'Hello'})
unittest.main()
