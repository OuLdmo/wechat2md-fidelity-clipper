"""UI interaction test on synthetic WeChat payload with mocked Chrome APIs.
This is NOT a real installed-extension test; Chrome extension APIs are simulated.
"""
import base64
import pathlib
from playwright.sync_api import sync_playwright
from test_v03 import ROOT,fixture,inject


def main():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        source=browser.new_page();source.set_content(fixture());article=inject(source)
        article['url']='https://mp.weixin.qq.com/s/knx5TvCehRpOACtYuG23QQ'
        panel=browser.new_page(viewport={'width':560,'height':880})
        html=(ROOT/'sidepanel.html').read_text()
        import re
        html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>','',html)
        html=html.replace('<script src="vendor/jszip.min.js"></script>','').replace('<script type="module" src="src/sidepanel.js"></script>','')
        html=html.replace('<link rel="stylesheet" href="styles.css">','<style>'+ (ROOT/'styles.css').read_text() + '</style>')
        panel.set_content(html)
        panel.add_script_tag(content=(ROOT/'vendor/jszip.min.js').read_text())
        for fn in ['markdown','ocr','archive','preview','formats']:
            js=(ROOT/'src/lib'/f'{fn}.js').read_text()
            js='\n'.join(line for line in js.splitlines() if not line.startswith('import '))
            js=js.replace('export function ','function ').replace('export async function ','async function ')
            panel.add_script_tag(content=js)
        panel.evaluate("Object.defineProperty(crypto,'subtle',{configurable:true,value:{digest:async()=>new Uint8Array(32).buffer}})")
        panel.evaluate('''article=>{
          window.__downloads=[];window.__tabs=[];window.__copied='';window.__printHtml='';window.ClipboardItem=class {constructor(parts){this.parts=parts}};
          Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async s=>{window.__copied=s;},write:async args=>{window.__copied='RICH_HTML'}}});
          window.chrome={
            tabs:{query:async()=>[{id:4,url:article.url,status:'complete',windowId:5}],get:async()=>({id:4,status:'complete',windowId:5}),sendMessage:async()=>({ok:true,article}),create:async args=>(window.__tabs.push(args),{id:7})},
            scripting:{executeScript:async()=>{}},
            permissions:{request:async()=>true},
            storage:{local:{set:async()=>{},get:async()=>({})}},
            downloads:{download:async args=>(window.__downloads.push(args),window.__downloads.length),onChanged:{addListener:()=>{},removeListener:()=>{}}},
            sidePanel:{setPanelBehavior:async()=>{}},
            runtime:{getURL:src=>`chrome-extension://mock/${src}`}
          };
        }''',article)
        side=(ROOT/'src/sidepanel.js').read_text()
        side='\n'.join(x for x in side.splitlines() if not x.startswith('import '))
        side=side.replace('import {','// import {')
        side='const savePrintDocument=async html=>(window.__printHtml=html,\'test-print-id\');\nconst captureNode=async()=>{throw Error(\'mock screenshot unavailable\')};\n'+side
        panel.add_script_tag(content=side)
        panel.locator('#url').fill(article['url'])
        panel.locator('#convert').click()
        panel.wait_for_function("() => !document.getElementById('compare').classList.contains('hidden') && document.getElementById('status').textContent.includes('ZIP 归档')",timeout=30000)
        assert len(panel.evaluate('window.__downloads'))==1
        assert 'archive' not in panel.locator('#status').inner_text().lower()
        print('PASS UI: URL input -> one-click ZIP download -> dual preview shown')
        panel.locator('#copySiYuan').click()
        panel.wait_for_function("() => window.__copied.includes('关键科学问题需要多模态感知') && !window.__copied.includes('<section')")
        assert not panel.evaluate('window.__copied').startswith('---')
        print('PASS UI v0.4: SiYuan copy emits pure Markdown and strips YAML / HTML wrappers')
        panel.locator('#copyText').click()
        panel.wait_for_function("() => window.__copied.includes('关键科学问题需要多模态感知')")
        assert '原文链接' in panel.evaluate('window.__copied')
        panel.locator('#copyMarkdown').click()
        panel.wait_for_function("() => window.__copied.includes('assets/images/')")
        panel.locator('#copyMarkdownRemote').click()
        panel.wait_for_function("() => window.__copied.includes('data:image/png;base64,')")
        panel.locator('#copyMarkdownInline').click()
        panel.wait_for_function("() => window.__copied.includes('data:image/svg+xml;base64,')")
        panel.locator('#copyRich').click()
        panel.wait_for_function("() => window.__copied==='RICH_HTML'")
        print('PASS UI: plain-text / original Markdown / portable Markdown / rich-text copy buttons')
        panel.locator('#toggleMarkdown').click()
        assert panel.locator('#markdownPreview').is_visible()
        panel.locator('#toggleMarkdown').click()
        assert panel.locator('#markdownFrame').is_visible()
        print('PASS UI: Markdown source and rendered preview toggle')
        panel.locator('#exportLink').click()
        panel.wait_for_function("() => window.__downloads.length===2")
        panel.locator('#exportInline').click()
        panel.wait_for_function("() => window.__downloads.length===3")
        panel.locator('#exportPdf').click()
        panel.wait_for_function("() => window.__tabs.length===1")
        print('PASS UI: re-export remote MD / embedded MD / PDF print page without re-extracting')
        panel.locator('#exportZip').click()
        panel.wait_for_function("() => window.__downloads.length===4")
        assert 'print.html?id=test-print-id' in panel.evaluate('window.__tabs[0].url')
        assert 'data:image/png;base64,' in panel.evaluate('window.__printHtml')
        print('PASS UI: print HTML includes offline images and an interactive print tab is opened')
        panel.locator('#exportHtml').click()
        panel.wait_for_function("() => window.__downloads.length===5")
        panel.locator('input[name="outputProfile"][value="fidelity"]').check()
        assert panel.locator('input[name="exportMode"][value="html"]').is_checked()
        panel.locator('input[name="outputProfile"][value="clean"]').check()
        assert panel.locator('input[name="exportMode"][value="zip"]').is_checked()
        print('PASS UI v0.4: fidelity/clean profile switches one-click export format')
        report=ROOT/'tests'/'reports'
        report.mkdir(exist_ok=True)
        panel.screenshot(path=str(report/'v03-panel-fixture.png'),full_page=True)
        browser.close()


if __name__=='__main__':main()
