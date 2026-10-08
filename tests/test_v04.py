"""v0.4 dual-output smoke test: real-shaped WeChat URL + synthetic DOM.
NOT a real WeChat server integration test. Assertions inspect ZIP *and* rendered HTML.
"""
import base64,io,json,zipfile
from playwright.sync_api import sync_playwright
from test_v03 import fixture,inject,ROOT,URL

def main():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        page=browser.new_page()
        page.set_content(fixture())
        article=inject(page)
        assert article['url']==URL
        page.evaluate("Object.defineProperty(crypto,'subtle',{configurable:true,value:{digest:async()=>new Uint8Array(32).buffer}})")
        result=page.evaluate('''async article=>{
          const a=await buildArchive(article,{images:true,math:true,html:true,report:true,imageMode:'local',outputProfile:'clean',ocr:{engine:'off'}});
          return {
            zip:await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(a.blob)}),
            clean:a.cleanMarkdown,rich:a.markdown,
            standalone:await highFidelityHtml(a),
            siyuan:await siyuanCompatibleMarkdown(a),
            external:await markdownVariant(a,'remote'),inline:await markdownVariant(a,'inline'),
            stats:a.quality
          };
        }''',article)
        z=zipfile.ZipFile(io.BytesIO(base64.b64decode(result['zip'])))
        names=set(z.namelist())
        assert {'article.md','article-rich.md','article-fidelity.html','source/article.html','manifest.json','quality-report.json'}.issubset(names),names
        md=z.read('article.md').decode('utf8')
        rich=z.read('article-rich.md').decode('utf8')
        html=z.read('article-fidelity.html').decode('utf8')
        assert md==result['clean']
        assert 'rowspan="2"' in rich
        assert '<section' not in md and '<table' not in md and 'style=' not in md and 'data-wfc-' not in md
        assert '第一栏的参数描述' in md and '第二栏的测试结果' in md
        assert '合并2行×1列' in md and '仿真' in md and '实测' in md
        assert 'https://doi.org/10.1109/example' in md
        assert 'display: flex' in html or 'display:flex' in html
        assert 'background-color:' in html
        assert 'assets/images/img-' in html
        assert 'data:image/png;base64,' in result['standalone']
        assert 'data:image/svg+xml;base64,' in result['standalone']
        assert '<script' not in result['standalone'].lower()
        assert 'data-wfc-layout' not in result['siyuan'] and '<section' not in result['siyuan'] and '<table' not in result['siyuan']
        assert not result['siyuan'].startswith('---')
        assert '# 射频物理 AI 公众号测试样本' in result['siyuan']
        assert 'https://doi.org/10.1109/example' in result['siyuan']
        assert 'data:image/png;base64' in result['inline']
        assert result['stats']['version']=='0.4.0'
        assert result['stats']['checks']['paragraphTextCheck']['reviewRequired']==0
        print('PASS: ZIP contains clean article.md, rich article-rich.md and faithful article-fidelity.html')
        print('PASS: clean Markdown contains no WeChat HTML containers or inline attributes')
        print('PASS: merged table semantic annotations, images, links and quoted text preserved')
        print('PASS: standalone fidelity HTML inlines PNG and SVG, retains flex/color and strips scripts')
        print('PASS: SiYuan Markdown strips YAML/frontmatter and stays editable GFM')
        print('PASS: real-shaped WeChat URL injected into hermetic article fixture (not live fetching)')
        view=browser.new_page(viewport={'width':850,'height':920})
        view.set_content(result['standalone'])
        assert view.locator('#js_content').count()==1
        assert view.locator('img').count()>=3
        assert view.locator('img').first.evaluate('(i)=>i.naturalWidth')>0
        assert view.locator('section').first.evaluate('(s)=>getComputedStyle(s).display')=='flex'
        view.screenshot(path=str(ROOT/'tests/reports/v04-html-fixture.png'),full_page=True)
        print('PASS: Chromium rendered high-fidelity standalone HTML with visible offline images')
        browser.close()

if __name__=='__main__':main()
