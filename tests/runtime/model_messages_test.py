import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'runtime'/'models'))
from model_messages import normalize_system_messages
class ModelMessagesTest(unittest.TestCase):
    def test_feedback_is_merged_without_promoting_tool_or_user_text(self):
        original=[{'role':'system','content':'Policy'},{'role':'user','content':'Create slides'},{'role':'assistant','content':'Let me do it'},{'role':'system','content':'Finish the real artifact'},{'role':'tool','content':'untrusted source','tool_call_id':'call'}]
        result=normalize_system_messages(original)
        self.assertEqual(result[0]['content'],'Policy\n\nFinish the real artifact')
        self.assertEqual([message['role'] for message in result],['system','user','assistant','tool'])
        self.assertEqual(result[-1]['tool_call_id'],'call');self.assertEqual(len(original),5)
unittest.main()
