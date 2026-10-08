"""v0.2 regression including actual-URL navigation simulation (intercepted fixture, NOT live WeChat fetch)."""
import base64
import io
import json
import pathlib
import zipfile
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

ROOT=pathlib.Path(__file__).resolve().parents[1]
REAL_URL='https://mp.weixin.qq.com/s/knx5TvCehRpOACtYuG23QQ'

def fixture_html():
    im=Image.new('RGB',(280,82),'white')
    d=ImageDraw.Draw(im);d.text((15,24),'E = mc^2',fill='black')
    buf=io.BytesIO();im.save(buf,format='PNG')
    formula='data:image/png;base64,'+base64.b64encode(buf.getvalue()).decode()
    return f'''<!doctype html><html lang="zh-CN"><head><title>真实公众号 URL 模拟测试</title><meta property="og:title" content="复杂技术文章测试"></head>
      <body><div id="activity-name">微信文章 URL 场景测试</div><div id="js_name">公众号高保真测试</div>
      <div id="js_content" class="rich_media_content">
      <h2>图文特殊布局和数学公式</h2>
      <section style="display:flex;gap:12px;background-color:#eef7fc"><p>左侧图文说明</p><p>右侧图文说明</p></section>
      <p>数学公式图像：<img alt="数学公式 E=mc^2" data-src="{formula}" src="{formula}"></p>
      <p>普通图片：<img alt="示例实验图" src="{formula}"></p>
      <p>参考文献 <a href="https://doi.org/10.1109/realistic">[1] Example</a></p>
      <table><tr><th rowspan="2">参数</th><th colspan="2">结果</th></tr><tr><th>仿真</th><th>实验</th></tr></table>
      <blockquote>引文：关键科学问题仍待解决。</blockquote>
      <svg xmlns="http://www.w3.org/2000/svg" width="75" height="25" aria-label="微波回路图"><path d="M0 1 L75 20" stroke="blue"/></svg>
      </div></body></html>'''

def extract(page):
    page.evaluate("() => {window.chrome={runtime:{onMessage:{addListener:(callback)=>{window.__handler=callback}}}}}")
    page.add_script_tag(path=str(ROOT/'extractor.js'))
    return page.evaluate('''() => new Promise((resolve,reject)=>window.__handler({kind:'WFC_EXTRACT'},null,response=>response.ok?resolve(response.article):reject(Error(response.error))))''')

def inject_archiver(page):
    page.add_script_tag(content=(ROOT/'vendor/jszip.min.js').read_text())
    md=(ROOT/'src/lib/markdown.js').read_text().replace('export function ','function ')
    page.add_script_tag(content=md)
    ocr=(ROOT/'src/lib/ocr.js').read_text().replace('export async function recognizeFormula','async function recognizeFormula')
    page.add_script_tag(content=ocr)
    arc=(ROOT/'src/lib/archive.js').read_text()
    arc=arc.replace("import {htmlToArticleDOM, createRenderer, yamlString, normalizeText, isSafeUrl} from './markdown.js';",'')
    arc=arc.replace("import {recognizeFormula} from './ocr.js';",'')
    arc=arc.replace('export async function buildArchive','async function buildArchive')+'\nwindow.buildArchive=buildArchive;'
    page.add_script_tag(content=arc)

def build(page,article,options):
    result=page.evaluate('''async ({article,options}) => {
        const out=await buildArchive(article,options);
        const bytes=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=()=>reject(r.error);r.readAsDataURL(out.blob)});
        return {markdown:out.markdown,quality:out.quality,zip:bytes,preview:out.sourcePreview};
    }''',{'article':article,'options':options})
    return result,zipfile.ZipFile(io.BytesIO(base64.b64decode(result['zip'])))

def main():
    html=fixture_html()
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        page=browser.new_page()
        # Managed Chromium in this environment blocks all navigations, even intercepted ones.
        # Simulate the HTML returned for a real-form WeChat URL with page.set_content().
        page.set_content(html)
        article=extract(page)
        article['url']=REAL_URL
        page.evaluate("Object.defineProperty(crypto,'subtle',{configurable:true,value:{digest:async()=>new Uint8Array(32).buffer}})")
        assert article['title']=='微信文章 URL 场景测试'
        assert len(article['assets'])==3,article['assets']  # two images + SVG
        assert len(article['visuals'])>=1,article['visuals']
        assert sum(1 for a in article['assets'] if a.get('mathCandidate'))==1
        # about:blank is an insecure origin: digest is only stubbed for pipeline tests.
        inject_archiver(page)
        page.evaluate("""() => {window.__networkRequests=[];const fetch0=window.fetch.bind(window);window.fetch=async (url,init) => {
          if(String(url).includes('api.mathpix.com')) {
            window.__networkRequests.push({url,method:init.method,body:JSON.parse(init.body),credentialHeaders:!!init.headers.app_id});
            return new Response(JSON.stringify({text:'\\\\(E=mc^2\\\\)',confidence:0.8}),{status:200,headers:{'content-type':'application/json'}});
          }
          return fetch0(url,init);
        }}""")
        base={'images':True,'math':True,'html':True,'report':True}
        remote,z=build(page,article,{**base,'imageMode':'remote','ocr':{'engine':'off'}})
        assert remote['quality']['exported']['externalAssets']==2
        assert 'data:image/png' in remote['markdown']
        assert 'source/article.html' in z.namelist()
        assert 'display: flex' in remote['markdown'] or 'display:flex' in remote['markdown']
        z.close()
        print('PASS URL simulation: real-form URL metadata + fixture DOM (no live navigation)')
        print('PASS remote mode: original image links/data URLs, semantic text, HTML layouts preserved')
        local,z=build(page,article,{**base,'imageMode':'local','ocr':{'engine':'mathpix','appId':'TEST_ID','appKey':'TEST_KEY'}})
        assert local['quality']['exported']['archiveAssets']==3,local['quality']
        assert local['quality']['exported']['formulaOcrCandidates']==1
        assert local['quality']['exported']['formulaOcrProduced']==1,local['quality']
        assert len(local['quality']['formulaOcr'])==1
        assert 'E=mc^2' in local['markdown'],local['markdown']
        assert '未经人工核验' in local['markdown']
        assert '![数学公式 E=mc^2](assets/images/' in local['markdown']
        assert 'rowspan="2"' in local['markdown']
        assert 'https://doi.org/10.1109/realistic' in local['markdown']
        manifest=json.loads(z.read('manifest.json'))
        assert all(item['sha256'] for item in manifest['resources'] if item['status']=='saved')
        assert any(x.startswith('assets/equations/') for x in z.namelist())
        assert 'TEST_KEY' not in json.dumps(local['quality'])
        z.close()
        print('PASS local image mode: original image bytes, SHA-256, math source and SVG preserved')
        print('PASS OCR transport: mock Mathpix API returns unverified LaTeX, image is not overwritten')
        manual,z=build(page,article,{**base,'imageMode':'local','ocr':{'engine':'off'},'ocrOverrides':{'asset-0001':r'E=mc^{2}'}})
        assert '已人工确认的公式转写' in manual['markdown']
        assert manual['quality']['checks']['formulaOcrVerified']==1
        z.close()
        print('PASS manual review: corrected OCR written with verified status')
        # Screenshot mode uses an actual raster PNG data URL (capture API is exercised separately).
        shot=dict(article)
        shot['assets']=[{**a,'screenshotDataUrl':a['url']} if a['kind']=='image' else a for a in article['assets']]
        screenshots,z=build(page,shot,{**base,'imageMode':'screenshot','ocr':{'engine':'off'}})
        assert screenshots['quality']['exported']['failedAssets']==0
        assert screenshots['quality']['exported']['archiveAssets']==3
        z.close()
        print('PASS screenshot output: images are written as offline files and used in Markdown')
        # The HTML export is safe, not an executable copy of the source.
        assert '<script' not in local['preview'].lower()
        assert 'onclick=' not in local['preview'].lower()
        print('PASS structural difference checks and inert HTML preview')
        # Exercise offline Markdown preview helper for both text and HTML layouts.
        preview=(ROOT/'src/lib/preview.js').read_text().replace("import {isSafeUrl, htmlToArticleDOM} from './markdown.js';",'').replace('export function markdownPreview','function markdownPreview')+'\nwindow.markdownPreview=markdownPreview;'
        page.add_script_tag(content=preview)
        rendered=page.evaluate('''({markdown,resources})=>markdownPreview(markdown,resources)''',{'markdown':local['markdown'],'resources':manifest['resources']})
        assert '<h1>微信文章 URL 场景测试</h1>' in rendered
        assert 'src="data:image/png' in rendered or 'src="https:' in rendered
        assert 'rowspan' in rendered
        print('PASS visual Markdown preview: heading, offline asset preview, complex table rendered')
        # Exercise capture crop logic with a simulated chrome.tabs screenshot API.
        screen=Image.new('RGB',(600,400),(250,250,250))
        draw=ImageDraw.Draw(screen)
        draw.rectangle((100,50,299,129),fill=(20,80,180))
        mem=io.BytesIO();screen.save(mem,format='PNG')
        shot_url='data:image/png;base64,'+base64.b64encode(mem.getvalue()).decode()
        script=(ROOT/'src/lib/capture.js').read_text().replace('export async function captureNode','async function captureNode')+'\nwindow.captureNode=captureNode;'
        page.add_script_tag(content=script)
        page.evaluate('''data => {window.chrome.tabs={get:async()=>({id:7,windowId:3}),update:async()=>({}),sendMessage:async()=>({ok:true,visible:true,rect:{x:100,y:50,width:200,height:80},viewport:{width:600,height:400}}),captureVisibleTab:async()=>data};}''',shot_url)
        actual=page.evaluate('''async()=> {const result=await captureNode(7,'capture-1');return result;}''')
        assert actual['width']==200 and actual['height']==80,actual
        cropped=Image.open(io.BytesIO(base64.b64decode(actual['dataUrl'].split(',')[1])))
        assert cropped.convert('RGB').getpixel((5,5))==(20,80,180),cropped.getpixel((5,5))
        print('PASS captureVisibleTab adapter: viewport-cropped screenshot is 200x80 PNG')
        browser.close()

if __name__=='__main__':main()
