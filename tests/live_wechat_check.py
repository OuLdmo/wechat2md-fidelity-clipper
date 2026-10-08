"""Manual live smoke test on an unrestricted computer (no automated content scraping).

Run: python tests/live_wechat_check.py https://mp.weixin.qq.com/s/<article>
This only checks whether real navigation succeeds and the article root is visible.
Complete ZIP tests should be performed manually via the installed extension.
"""
import argparse
from playwright.sync_api import sync_playwright

argp=argparse.ArgumentParser()
argp.add_argument('url')
a=argp.parse_args()
if not a.url.startswith('https://mp.weixin.qq.com/s/'):
    argp.error('Expected https://mp.weixin.qq.com/s/... URL')
with sync_playwright() as p:
    b=p.chromium.launch(headless=False)
    page=b.new_page()
    try:
        page.goto(a.url,timeout=30000,wait_until='domcontentloaded')
        print('Final URL:',page.url)
        print('Title:',page.title())
        print('Article root exists:',page.locator('#js_content,.rich_media_content').count()>0)
        print('Visible body characters:',len(page.locator('body').inner_text(timeout=10000).strip()))
    except Exception as e:
        print('LIVE CHECK FAILED:',str(e))
    input('Press Enter to close browser after manual inspection: ')
    b.close()
