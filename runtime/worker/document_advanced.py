"""Bounded image inspection and OCR; no source code is accepted from the caller."""
import io, shutil, subprocess
from PIL import Image

def run(operation, path, args, output, record):
    if path.stat().st_size > 25 * 1024 * 1024:
        raise ValueError('Input exceeds 25 MiB')
    Image.MAX_IMAGE_PIXELS = 25_000_000
    if operation in ('image_metadata', 'image_open'):
        with Image.open(path) as image:
            if image.width * image.height > 25_000_000:
                raise ValueError('Image exceeds 25 megapixels')
            data = {'width': image.width, 'height': image.height, 'format': image.format,
                    'mode': image.mode, 'frames': getattr(image, 'n_frames', 1)}
            if operation == 'image_open':
                image.thumbnail((1600, 1600))
                preview = output('image-preview', 'png')
                image.convert('RGB').save(preview)
                data['files'] = [record(preview, 'image/png')]
            return data
    executable = shutil.which('tesseract')
    if not executable:
        raise ValueError('OCR_RUNTIME_UNAVAILABLE: Install Tesseract and the requested language data')
    import re
    language = args.get('language', 'eng')
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_+]{0,49}', language):
        raise ValueError('Invalid OCR language')
    pages = []
    def recognize(image, number):
        if image.width * image.height > 25_000_000:
            raise ValueError('OCR image exceeds 25 megapixels')
        stream = io.BytesIO(); image.convert('RGB').save(stream, format='PNG')
        try:
            result = subprocess.run([executable, 'stdin', 'stdout', '-l', language],
                                    input=stream.getvalue(), capture_output=True, timeout=15, check=True)
        except FileNotFoundError as error:
            raise ValueError('OCR_RUNTIME_UNAVAILABLE: Tesseract is no longer available; repair the OCR installation') from error
        except subprocess.TimeoutExpired as error:
            raise ValueError('OCR_TIMEOUT: Recognition exceeded 15 seconds; retry a smaller image or fewer pages') from error
        except subprocess.CalledProcessError as error:
            detail = (error.stderr or b'').decode('utf-8', errors='replace')[-2000:]
            if any(marker in detail.lower() for marker in ('failed loading language', 'error opening data file')):
                raise ValueError('OCR_LANGUAGE_UNAVAILABLE: Check Tesseract language data for ' + language + '. ' + detail) from error
            raise ValueError('OCR_FAILED: Tesseract could not recognize this input. ' + detail) from error
        text = result.stdout.decode('utf-8', errors='replace')
        pages.append({'page': number, 'text': text[:12000], 'truncated': len(text) > 12000})
    if path.suffix.lower() == '.pdf':
        import pypdfium2 as pdfium
        document = pdfium.PdfDocument(str(path))
        try:
            start = max(0, int(args.get('start_page', 1))-1)
            if start >= len(document): raise ValueError('Start page is outside this document')
            for number in range(start, min(len(document), start + min(10, int(args.get('max_pages', 3))))):
                page = document[number]
                try:
                    bitmap = page.render(scale=min(2.5, 2500/max(page.get_width(), page.get_height())))
                    try: recognize(bitmap.to_pil(), number+1)
                    finally: bitmap.close()
                finally: page.close()
        finally: document.close()
    else:
        with Image.open(path) as image: recognize(image, 1)
    return {'pages': pages, 'text': '\n\n'.join(page['text'] for page in pages),
            'engine': 'tesseract', 'language': language, 'files': []}
