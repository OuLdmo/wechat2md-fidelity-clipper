"""Static package checks; no external network or extension install needed."""
import json
import pathlib
import re
import subprocess
ROOT=pathlib.Path(__file__).resolve().parents[1]
m=json.loads((ROOT/'manifest.json').read_text())
assert m['manifest_version']==3
assert m['version']=='0.4.0'
assert 'sidePanel' in m['permissions']
assert 'downloads' in m['permissions']
assert 'activeTab' in m['permissions']
assert m['side_panel']['default_path']=='sidepanel.html'
assert (ROOT/m['side_panel']['default_path']).is_file()
assert (ROOT/m['background']['service_worker']).is_file()
html=(ROOT/'sidepanel.html').read_text()
for id in ['exportMode','copyText','copyMarkdown','copyMarkdownRemote','copyMarkdownInline','copyRich','exportPdf','exportInline','imageMode','ocrEngine','ocrScope','mathpixId','mathpixKey','sourceFrame','markdownFrame','markdownPreview','ocrReview','exportRevised']:
    assert id in html,id
for src in re.findall(r'<script[^>]*\bsrc="([^"]+)"',html):
    assert not src.startswith('http'),src
    assert (ROOT/src).is_file(),src
for f in (ROOT/'src').rglob('*.js'):
    r=subprocess.run(['node','--check',str(f)],capture_output=True,text=True)
    assert r.returncode==0,(f,r.stderr)
for f in [ROOT/'extractor.js',ROOT/'background.js']:
    r=subprocess.run(['node','--check',str(f)],capture_output=True,text=True)
    assert r.returncode==0,(f,r.stderr)
for name in ['formats.js','print-store.js','capture.js','ocr.js','preview.js','archive.js','markdown.js']:
    assert (ROOT/'src/lib'/name).is_file(),name
assert (ROOT/'print.html').is_file()
assert (ROOT/'src/print.js').is_file()
print('PASS v0.4 manifest, sidepanel dependencies, offline script assets, Node JS syntax')
