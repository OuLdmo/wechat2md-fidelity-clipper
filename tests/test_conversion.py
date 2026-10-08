"""End-to-end browser DOM -> Markdown -> in-memory ZIP fixture test (no WeChat/network needed)."""
import base64
import io
import json
import os
import pathlib
import socketserver
import threading
import zipfile
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def log_message(self, fmt, *args):
        pass

class TCPServer(socketserver.TCPServer):
    allow_reuse_address = True

def run():
    with TCPServer(('127.0.0.1', 0), Handler) as server:
        port=server.server_address[1]
        thread=threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        if True:
            with sync_playwright() as p:
                browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
                page=browser.new_page()
                page.set_content((ROOT/'tests/fixtures/wechat_sample.html').read_text(encoding='utf-8'))
                page.evaluate('''() => { window.chrome={runtime:{onMessage:{addListener:(cb)=>{window.__extractListener=cb;}}}} }''')
                page.add_script_tag(path=str(ROOT/'extractor.js'))
                article=page.evaluate('''() => new Promise((resolve,reject)=> {
                    window.__extractListener({kind:'WFC_EXTRACT'},null,response=>response?.ok?resolve(response.article):reject(Error(response?.error||'Extractor failed')));
                })''')
                assert article['title']=='微波系统与数学公式转换测试', article['title']
                assert len(article['assets'])==2, article['assets']
                assert article['source']['math']==2, article['source']
                # about:blank is not a secure origin; extension pages provide crypto.subtle.
                # Stub only digest availability for ZIP pipeline integration here.
                page.evaluate("Object.defineProperty(crypto,'subtle',{configurable:true,value:{digest:async()=>new Uint8Array(32).buffer}})")
                page.add_script_tag(content=(ROOT/'vendor/jszip.min.js').read_text(encoding='utf-8'))
                markdown_js=(ROOT/'src/lib/markdown.js').read_text(encoding='utf-8')
                markdown_js=markdown_js.replace('export function ', 'function ')+'''
window.__markdownExports={htmlToArticleDOM,createRenderer,yamlString,normalizeText,isSafeUrl};
'''
                page.add_script_tag(content=markdown_js)
                archive_js=(ROOT/'src/lib/archive.js').read_text(encoding='utf-8')
                archive_js=archive_js.replace("import {htmlToArticleDOM, createRenderer, yamlString, normalizeText, isSafeUrl} from './markdown.js';","")
                archive_js=archive_js.replace("import {recognizeFormula} from './ocr.js';","")
                archive_js='async function recognizeFormula(){throw Error("OCR mock not installed");}\n'+archive_js
                archive_js=archive_js.replace('export async function buildArchive', 'async function buildArchive')+'\nwindow.buildArchive=buildArchive;'
                page.add_script_tag(content=archive_js)
                out=page.evaluate('''async article => {
                    const result=await buildArchive(article,{images:true,math:true,html:true,report:true});
                    return {
                      filename:result.filename,
                      quality:result.quality,
                      bytesBase64:await new Promise((resolve,reject)=> {
                        const reader=new FileReader();
                        reader.onload=()=>resolve(reader.result.split(',')[1]);
                        reader.onerror=()=>reject(reader.error);
                        reader.readAsDataURL(result.blob);
                      })
                    };
                }''',article)
                # Failure-mode regression: blocked CDN must not silently lose the figure.
                defanged=dict(article)
                defanged['assets']=[dict(item) for item in article['assets']]
                defanged['assets'][0]['url']='https://example.invalid/blocked-image.png'
                defanged['assets'][0]['candidates']=['https://example.invalid/blocked-image.png']
                defanged['html'] += '<div onclick="alert(1)"><script>alert(2)</script></div>'
                page.evaluate("() => {window.fetch=async()=>{throw Error('模拟 CDN 拒绝下载')}}")
                bad=page.evaluate('''async article => {
                    const result=await buildArchive(article,{images:true,math:true,html:true,report:true});
                    return {
                        quality:result.quality,
                        markdown:result.markdown,
                        b64:await new Promise(resolve=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result.split(',')[1]);fr.readAsDataURL(result.blob);})
                    };
                }''',defanged)
                assert bad['quality']['exported']['failedAssets']==1,bad['quality']
                assert '[波形图片](https://example.invalid/blocked-image.png)' in bad['markdown']
                browser.close()
            with zipfile.ZipFile(io.BytesIO(base64.b64decode(bad['b64']))) as z:
                safehtml=z.read('source/article.html').decode('utf-8')
                assert '<script' not in safehtml,safehtml
                assert 'onclick=' not in safehtml,safehtml
                print('PASS failure/safety: blocked CDN falls back to URL; HTML strips scripts/events')
            with zipfile.ZipFile(io.BytesIO(base64.b64decode(out['bytesBase64']))) as z:
                names=set(z.namelist())
                md=z.read('article.md').decode('utf-8')
                rich=z.read('article-rich.md').decode('utf-8')
                report=json.loads(z.read('quality-report.json'))
                assets=json.loads(z.read('manifest.json'))['resources']
                assert {'article.md','source/article.html','source/original-dom.html.txt','quality-report.json','manifest.json'}.issubset(names),names
                assert '$E=mc^2$' in md,md
                assert '$$\nx^2+1\n$$' in md,md
                assert '![波形图片](assets/images/img-' in md,md
                assert '![天线模型](assets/figures/svg-' in md,md
                assert '| 参数 | 值 |' in md,md
                assert 'rowspan="2"' in rich,rich
                assert '合并2行×1列' in md,md
                assert '<section' not in md and '<table' not in md
                assert r'\[1\] 参考文献' in md,md
                assert 'https://doi.org/10.1109/test' in md,md
                assert 'important' not in md.lower()
                assert report['source']['math']==2,report
                assert report['exported']['archiveAssets']==2,report
                assert report['exported']['complexTableHtmlFallbacks']==1,report
                assert all(r['status']=='saved' and r['sha256'] for r in assets),assets
                assert len([name for name in names if name.startswith('assets/') and not name.endswith('/')])==2,names
                print('PASS extractor: headings/text/math/image/svg/metadata')
                print('PASS Markdown: math, image references, tables, hyperlinks, quotes')
                print('PASS ZIP: original DOM, offline HTML, resources, hashes, quality report')
                print('archive filename:',out['filename'])
                print('source counters:',report['source'])
                print('output counters:',report['exported'])

if __name__=='__main__':
    run()
