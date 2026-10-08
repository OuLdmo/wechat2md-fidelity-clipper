#!/usr/bin/env python3
"""Optional local formula OCR companion. Binds strictly to 127.0.0.1:8765.

Setup: pip install pix2tex pillow torch
Run: python local_formula_ocr.py
Smoke-test without installing OCR model:
  python local_formula_ocr.py --mock-latex 'E=mc^2'

OCR suggestions are *not* guaranteed mathematically accurate. Original image stays archived.
"""
import argparse
import base64
import io
import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BODY = 12_000_000
parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=8765)
parser.add_argument('--mock-latex', default=None, help='TEST ONLY: return this literal formula instead of running pix2tex')
args = parser.parse_args()
_model = None

def model():
    global _model
    if _model is None:
        from pix2tex.cli import LatexOCR
        _model = LatexOCR()
    return _model

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *parts):
        print('[formula OCR] ' + fmt % parts)

    def allow_extension(self):
        origin = self.headers.get('Origin', '')
        return not origin or re.fullmatch(r'chrome-extension://[a-p]{32}', origin) is not None

    def write_headers(self, status):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        origin = self.headers.get('Origin', '')
        if self.allow_extension() and origin:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()

    def reply(self, code, payload):
        self.write_headers(code)
        self.wfile.write(json.dumps(payload, ensure_ascii=False).encode('utf-8'))

    def do_OPTIONS(self):
        if not self.allow_extension():
            return self.reply(403, {'error': 'Extension-origin requests only'})
        self.write_headers(204)

    def do_POST(self):
        if self.path != '/ocr' or not self.allow_extension():
            return self.reply(403, {'error': 'Forbidden'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > MAX_BODY:
                return self.reply(413, {'error': 'Payload too large'})
            inp = json.loads(self.rfile.read(length))
            image = inp.get('image', '')
            if not image.startswith('data:image/') or ';base64,' not in image:
                return self.reply(400, {'error': 'Expected data:image/*;base64'})
            raw = base64.b64decode(image.split(';base64,', 1)[1], validate=True)
            if len(raw) > 8_000_000:
                return self.reply(413, {'error': 'Image too large'})
            from PIL import Image
            img = Image.open(io.BytesIO(raw)).convert('RGB')
            if img.width * img.height > 18_000_000:
                return self.reply(413, {'error': 'Pixel count too high'})
            latex = args.mock_latex if args.mock_latex is not None else model()(img)
            self.reply(200, {'latex': str(latex), 'engine': 'pix2tex', 'verified': False})
        except Exception as exc:
            self.reply(422, {'error': type(exc).__name__ + ': ' + str(exc)[:200]})

if __name__ == '__main__':
    if not 1024 <= args.port <= 65535:
        raise ValueError('Use a port in 1024..65535')
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'Listening locally on http://127.0.0.1:{args.port}/ocr. Press Ctrl+C to stop.')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
