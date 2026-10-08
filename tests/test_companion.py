"""In-process local OCR companion contract test; does NOT test trained pix2tex model."""
import base64
import io
import json
import pathlib
import runpy
import sys
from email.message import Message
from PIL import Image

ROOT=pathlib.Path(__file__).resolve().parents[1]
saved=sys.argv[:]
sys.argv=['local_formula_ocr.py','--mock-latex','a^2+b^2=c^2']
try:
    ns=runpy.run_path(str(ROOT/'companion/local_formula_ocr.py'),run_name='test_companion')
finally:
    sys.argv=saved

class MockHandler(ns['Handler']):
    def __init__(self,content,origin):
        self.path='/ocr';self.rfile=io.BytesIO(content);self.wfile=io.BytesIO()
        self.headers=Message();self.headers['Origin']=origin;self.headers['Content-Length']=str(len(content))
        self.response_code=0;self.response_headers={}
    def send_response(self,status):self.response_code=status
    def send_header(self,key,value):self.response_headers[key]=value
    def end_headers(self):pass

im=Image.new('RGB',(28,18),'white');buf=io.BytesIO();im.save(buf,format='PNG')
req={'image':'data:image/png;base64,'+base64.b64encode(buf.getvalue()).decode()}
handler=MockHandler(json.dumps(req).encode(),'chrome-extension://'+'a'*32)
handler.do_POST()
assert handler.response_code==200
assert json.loads(handler.wfile.getvalue())['latex']=='a^2+b^2=c^2'
assert handler.response_headers['Access-Control-Allow-Origin'].startswith('chrome-extension://')
blocked=MockHandler(json.dumps(req).encode(),'https://untrusted.example')
blocked.do_POST()
assert blocked.response_code==403
print('PASS local OCR handler: extension-only CORS, mock formula, hostile origin rejected')
