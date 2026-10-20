import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'runtime'/'models'))
from unicode_text import clean_unicode

class UnicodeTextTest(unittest.TestCase):
    def test_repairs_invalid_surrogates_without_losing_valid_text(self):
        value={'messages':[{'content':'before \udc8d after \ud83d\ude42 café'}]}
        repaired=clean_unicode(value)
        self.assertEqual(repaired['messages'][0]['content'],'before \ufffd after 🙂 café')
        repaired['messages'][0]['content'].encode('utf-8')
        self.assertEqual(value['messages'][0]['content'],'before \udc8d after \ud83d\ude42 café')

unittest.main()
