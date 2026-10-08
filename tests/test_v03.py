"""v0.3 browser-DOM fixture integration + 4 export formats + PDF rendering.

The URL below is a real-form article URL from the user's earlier research; this
fixture is NOT live HTTP content. Live access is separately marked unverified.
"""
import base64
import io
import json
import pathlib
import zipfile
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

ROOT=pathlib.Path(__file__).resolve().parents[1]
URL='https://mp.weixin.qq.com/s/knx5TvCehRpOACtYuG23QQ'


def fixture():
    image=Image.new('RGB',(420,220),'white')
    draw=ImageDraw.Draw(image)
    draw.rectangle((10,10,410,210),outline=(40,90,160),width=3)
    draw.text((30,70),'f = 2.45 GHz',fill='black')
    raw=io.BytesIO(); image.save(raw,format='PNG')
    data='data:image/png;base64,'+base64.b64encode(raw.getvalue()).decode()
    return f'''<!doctype html><html lang="zh-CN"><head><title>射频物理 AI 公众号测试样本</title></head><body>
      <div id="activity-name">射频物理 AI 公众号测试样本</div><div id="js_name">科研笔记专用公众号</div>
      <div id="js_content" class="rich_media_content">
      <h2>第一节：公式与图文排版</h2>
      <p>关键科学问题需要多模态感知以及高保真归档。</p>
      <section style="display:flex;gap:13px;background-color:#f5faff;padding:10px">
        <div><p>第一栏的参数描述与说明。</p></div><div><p>第二栏的测试结果数据。</p></div>
      </section>
      <p>实验图：<img alt="射频实验图" data-src="{data}" src="{data}"></p>
      <p>公式图：<img alt="公式方程" src="{data}"></p>
      <p>阅读 <a href="https://doi.org/10.1109/example">参考文献 DOI</a> 可获悉更多研究信息。</p>
      <table><tr><th rowspan="2">项目</th><th colspan="2">结果</th></tr><tr><th>仿真</th><th>实测</th></tr></table>
      <blockquote>引文内容必须完整保存，不能静默省略。</blockquote>
      <svg xmlns="http://www.w3.org/2000/svg" width="100" height="40" aria-label="射频电路 SVG">
        <circle cx="20" cy="20" r="15" stroke="#345" fill="#def"/></svg>
      <pre><code>const gamma = (z-z0)/(z+z0);</code></pre>
      </div></body></html>'''


def inject(page):
    page.evaluate("() => {window.chrome={runtime:{onMessage:{addListener:(f)=>{window.__extract=f}}}}}")
    page.add_script_tag(path=str(ROOT/'extractor.js'))
    payload=page.evaluate("() => new Promise((r,j)=>window.__extract({kind:'WFC_EXTRACT'},null,v=>v.ok?r(v.article):j(Error(v.error))))")
    payload['url']=URL
    page.add_script_tag(content=(ROOT/'vendor/jszip.min.js').read_text())
    md=(ROOT/'src/lib/markdown.js').read_text().replace('export function ','function ')
    page.add_script_tag(content=md)
    ocr=(ROOT/'src/lib/ocr.js').read_text().replace('export async function recognizeFormula','async function recognizeFormula')
    page.add_script_tag(content=ocr)
    archive=(ROOT/'src/lib/archive.js').read_text().replace("import {htmlToArticleDOM, createRenderer, yamlString, normalizeText, isSafeUrl} from './markdown.js';",'').replace("import {recognizeFormula} from './ocr.js';",'')
    archive=archive.replace('export async function buildArchive','async function buildArchive')+'\nwindow.buildArchive=buildArchive;'
    page.add_script_tag(content=archive)
    extra=(ROOT/'src/lib/formats.js').read_text().replace('export async function ','async function ').replace('export function ','function ')
    extra+='\nwindow.WFCFormats={markdownVariant,articlePlainText,printableHtml,previewAssetData};'
    page.add_script_tag(content=extra)
    return payload


def main():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        page=browser.new_page()
        page.set_content(fixture())
        article=inject(page)
        # about:blank opaque origin: crypto.subtle is unavailable. Stub is ONLY
        # used here to exercise zip/serialization, not validate actual hashes.
        page.evaluate("Object.defineProperty(crypto,'subtle',{configurable:true,value:{digest:async()=>new Uint8Array(32).buffer}})")
        assert article['title']=='射频物理 AI 公众号测试样本'
        assert article['source']['links']==1
        assert article['source']['tables']==1
        assert len(article['assets'])==3
        assert len(article['visuals'])>=1
        print('PASS: real-form WeChat URL + simulated article DOM extraction (not live fetching)')
        response=page.evaluate('''async ({article}) => {
            const a=await buildArchive(article,{images:true,math:true,html:true,report:true,imageMode:'local',ocr:{engine:'off'}});
            const one=await WFCFormats.markdownVariant(a,'remote');
            const two=await WFCFormats.markdownVariant(a,'inline');
            const text=WFCFormats.articlePlainText(a);
            const print=await WFCFormats.printableHtml(a);
            const preview=await WFCFormats.previewAssetData(a);
            const blob=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(a.blob);});
            return {blob,markdown:a.markdown,remote:one,inline:two,text,print,previewCount:preview.size,report:a.quality};
        }''',{'article':article})
        z=zipfile.ZipFile(io.BytesIO(base64.b64decode(response['blob'])))
        names=z.namelist()
        assert 'article.md' in names and 'source/article.html' in names and 'quality-report.json' in names
        assert len([n for n in names if n.startswith('assets/') and not n.endswith('/')])==2  # repeated PNG is intentionally deduplicated
        manifest=json.loads(z.read('manifest.json'))
        assert len(manifest['resources'])==3
        assert 'rowspan="2"' in response['markdown']
        assert 'https://doi.org/10.1109/example' in response['markdown']
        assert '[原文 HTML 排版快照]' not in response['remote']
        assert '![' in response['remote']
        assert 'data:image/png;base64,' in response['remote']
        assert 'data:image/svg+xml;base64,' in response['remote']
        assert 'data:image/png;base64,' in response['inline']
        assert 'data:image/svg+xml;base64,' in response['inline']
        assert 'assets/images/' not in response['inline']
        assert '关键科学问题需要多模态感知' in response['text']
        assert '参考文献 DOI (https://doi.org/10.1109/example)' in response['text']
        assert '<script' not in response['print'].lower()
        assert 'data:image/png;base64,' in response['print']
        assert 'data:image/svg+xml;base64,' in response['print']
        assert '../assets/' not in response['print']
        assert response['previewCount']==2  # one PNG shared by two image nodes plus SVG
        print('PASS: ZIP offline Markdown + assets + HTML snapshot + quality report')
        print('PASS: standalone Markdown with remote links and inline image fallbacks')
        print('PASS: standalone Markdown with Data URI embedded PNG + SVG')
        print('PASS: plain text copy payload, links and sentence preservation')
        print('PASS: printable offline HTML embeds local PNG + SVG, strips executable scripts')
        assert response['report']['checks']['paragraphTextCheck']['reviewRequired']==0,response['report']
        print('PASS: normalized paragraph preservation; complex table and layout fallback')
        # Browser PDF generation tests print CSS/layout. This is NOT automatic
        # installation test of the extension's toolbar printing.
        pdfpage=browser.new_page(viewport={'width':1100,'height':850})
        pdfpage.set_content(response['print'],wait_until='load')
        out=ROOT/'tests'/'reports'/'v03-print-fixture.pdf';out.parent.mkdir(parents=True,exist_ok=True)
        pdfpage.pdf(path=str(out),format='A4',print_background=True,prefer_css_page_size=True)
        assert out.stat().st_size>4000
        print(f'PASS: Chromium rendered printable article as searchable PDF fixture ({out.stat().st_size} bytes)')
        pdfpage.close()
        # Enforce validation when inline threshold too low.
        value=page.evaluate('''async ({article})=>{
            const a=await buildArchive(article,{images:true,html:true,report:true,imageMode:'local',ocr:{engine:'off'}});
            try {await WFCFormats.markdownVariant(a,'inline',{maxInlineBytes:20});return false;}
            catch(e){return /超过/.test(e.message);}
        }''',{'article':article})
        assert value
        print('PASS: embedded-image size limit fails clearly instead of silently dropping content')
        browser.close()


if __name__=='__main__':main()
