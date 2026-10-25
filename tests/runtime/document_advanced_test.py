import sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'runtime' / 'worker'))
from document_advanced import run
from PIL import Image

class AdvancedDocuments(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='horizon-doc-tools-')
        self.root = Path(self.tmp.name)
    def tearDown(self): self.tmp.cleanup()
    def output(self, name, extension): return self.root / (name + '.' + extension)
    def record(self, path, mime): return {'path': str(path), 'mediaType': mime}
    def test_image_metadata_and_real_preview(self):
        source = self.root / 'image.png'
        Image.new('RGB', (1800, 900), '#bf7554').save(source)
        metadata = run('image_metadata', source, {}, self.output, self.record)
        self.assertEqual(metadata['width'], 1800)
        preview = run('image_open', source, {}, self.output, self.record)
        with Image.open(preview['files'][0]['path']) as image:
            self.assertEqual(image.size, (1600, 800))
            self.assertEqual(image.format, 'PNG')
    def test_pdf_pages_render_and_ocr_dispatch_with_fixture_engine(self):
        from reportlab.pdfgen.canvas import Canvas
        path = self.root / 'two-pages.pdf'
        canvas = Canvas(str(path));canvas.drawString(40, 700, 'First page');canvas.showPage()
        canvas.drawString(40, 700, 'Second page');canvas.save()
        calls = []
        def fake(command, **kwargs):
            self.assertEqual(command[:3], ['tesseract-fixture', 'stdin', 'stdout'])
            self.assertTrue(kwargs['input'].startswith(b'\x89PNG'))
            calls.append(command)
            return SimpleNamespace(stdout=('Text ' + str(len(calls))).encode())
        with patch('document_advanced.shutil.which', return_value='tesseract-fixture'), patch('document_advanced.subprocess.run', side_effect=fake):
            result = run('document_ocr', path, {'language':'eng','max_pages':2}, self.output, self.record)
        self.assertEqual([page['page'] for page in result['pages']], [1, 2])
        self.assertEqual(result['text'], 'Text 1\n\nText 2')
    def test_missing_ocr_and_invalid_language_are_explicit(self):
        path = self.root / 'image.png';Image.new('RGB', (20,20)).save(path)
        with patch('document_advanced.shutil.which', return_value=None):
            with self.assertRaisesRegex(ValueError, 'OCR_RUNTIME_UNAVAILABLE'):
                run('document_ocr', path, {}, self.output, self.record)
        with patch('document_advanced.shutil.which', return_value='tesseract-fixture'):
            with self.assertRaisesRegex(ValueError, 'Invalid OCR language'):
                run('document_ocr', path, {'language':'eng --evil'}, self.output, self.record)

if __name__ == '__main__': unittest.main()
