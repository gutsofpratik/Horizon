import sys,json,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'runtime'/'models'))
from json_text_stream import JsonTextStream
class JsonTextStreamTest(unittest.TestCase):
    def test_streams_only_root_text_fields_across_every_chunk_boundary(self):
        data={'reasoning':'Check "facts"\nthen answer \U0001f642','content':'Result: 391','tool_calls':[{'name':'test','arguments':{'content':'never display tool arguments'}}]}
        text=json.dumps(data,ensure_ascii=True)
        for size in (1,2,7,1000):
            result={'reasoning':'','content':''};stream=JsonTextStream()
            for start in range(0,len(text),size):
                for key,value in stream.feed(text[start:start+size]).items():result[key]+=value
            self.assertEqual(result,{'reasoning':data['reasoning'],'content':data['content']})
    def test_emits_before_the_object_finishes(self):
        stream=JsonTextStream();self.assertEqual(stream.feed('{"reasoning":"Check '),{'reasoning':'Check '});self.assertEqual(stream.feed('the data","content":"Hel'),{'reasoning':'the data','content':'Hel'})
    def test_never_emits_unpaired_surrogates(self):
        for value,expected in [('\udc8d','\ufffd'),('\ud800','\ufffd'),('\ud800\ud801x','\ufffd\ufffdx')]:
            stream=JsonTextStream();result=''
            for char in json.dumps({'content':value}):result+=stream.feed(char).get('content','')
            self.assertEqual(result,expected)
            result.encode('utf-8')
unittest.main()
