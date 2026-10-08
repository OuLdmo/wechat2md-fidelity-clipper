/* Runs only inside an explicitly opened https://mp.weixin.qq.com article tab. */
(() => {
  if (globalThis.__wfcExtractorInstalled) return;
  globalThis.__wfcExtractorInstalled = true;

  function absolute(raw) {
    if (!raw || /^\s*(?:javascript:|vbscript:)/i.test(raw)) return '';
    try {
      const url = new URL(raw, location.href);
      return ['https:', 'http:', 'data:', 'blob:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  }
  function extract() {
    const root = document.querySelector('#js_content') || document.querySelector('.rich_media_content') || document.querySelector('#img-content') || document.querySelector('article');
    if (!root) throw new Error('找不到公众号文章正文。页面可能处于验证/登录状态，或者文章已经失效。');
    const plain = root.innerText || root.textContent || '';
    if (plain.trim().length < 12 && !root.querySelector('img,svg,video,table')) {
      throw new Error('正文尚未加载完成，或页面受到访问限制。请打开文章确认可阅读后重试。');
    }
    const meta = (name, prop) => document.querySelector(`meta[${prop || 'property'}="${name}"]`)?.content?.trim() || '';
    const title = document.querySelector('#activity-name')?.textContent?.trim() || document.querySelector('.rich_media_title')?.textContent?.trim() || meta('og:title') || document.title;
    const account = document.querySelector('#js_name')?.textContent?.trim() || document.querySelector('.rich_media_meta_nickname')?.textContent?.trim() || meta('author','name') || '';
    const published = document.querySelector('#publish_time')?.textContent?.trim() || document.querySelector('#js_publish_time')?.textContent?.trim() || '';
    const author = document.querySelector('#js_author_name')?.textContent?.trim() || document.querySelector('.rich_media_meta_text')?.textContent?.trim() || '';
    const source = {
      paragraphs: root.querySelectorAll('p').length,
      imageTags: root.querySelectorAll('img').length,
      links: root.querySelectorAll('a[href]').length,
      tables: root.querySelectorAll('table').length,
      svgs: root.querySelectorAll('svg').length,
      canvases: root.querySelectorAll('canvas').length,
      media: root.querySelectorAll('video,audio,iframe').length,
      textCharacters: plain.replace(/\s/g,'').length,
      potentialIconFonts: root.querySelectorAll('[class*=iconfont],[class*=icon-],[class*=fa-]').length
    };
    const originalDom = root.outerHTML;
    const clone = root.cloneNode(true);
    const originalToClone = new WeakMap();
    const originalElements = [root, ...root.querySelectorAll('*')];
    const clonedElements = [clone, ...clone.querySelectorAll('*')];
    originalElements.forEach((el, i) => originalToClone.set(el, clonedElements[i]));
    const assets = [];
    const warnings = [];
    const visuals = [];
    let visualCounter = 0;
    let captureCounter = 0;
    // Mark live elements temporarily so the extension can scroll/capture them.
    function captureId(original) {
      if(!original.dataset.wfcCaptureId) original.dataset.wfcCaptureId = 'capture-' + (++captureCounter);
      return original.dataset.wfcCaptureId;
    }
    function isMathImage(element) {
      const attrs = [element.alt,element.title,element.className,element.getAttribute('data-type'),element.parentElement?.className,element.parentElement?.getAttribute('data-formula')].map(v=>typeof v==='string'?v:'').join(' ');
      return /(?:formula|equation|latex|mathjax|math[-_ ]?img|公式|方程|数学表达式)/i.test(attrs);
    }
    if(source.potentialIconFonts) warnings.push(`发现 ${source.potentialIconFonts} 个可能依赖外部图标字体的对象；字体文件不保证离线保存，原始 DOM 供复核。`);
    let n = 0;
    const nextId = () => 'asset-' + String(++n).padStart(4,'0');
    const matchingClone = (selector) => {
      const a = Array.from(root.querySelectorAll(selector));
      return a.map((el) => [el, originalToClone.get(el)]).filter(p => p[1] && clone.contains(p[1]));
    };
    function register(element, data) {
      const id = nextId();
      assets.push({id, ...data});
      element.setAttribute('data-wfc-asset',id);
      return id;
    }
    // Preserve TeX before discarding renderer-specific DOM or script tags.
    let mathCount = 0;
    for (const node of Array.from(clone.querySelectorAll('.katex, script[type^="math/tex"], [data-tex], [data-latex], math'))) {
      if (!clone.contains(node) || node.closest('[data-wfc-math]')) continue;
      if (node.matches('math') && node.closest('.katex')) continue;
      const latex = node.querySelector?.('annotation[encoding="application/x-tex"]')?.textContent || node.getAttribute('data-tex') || node.getAttribute('data-latex') || (node.matches('script') ? node.textContent : '');
      const mathml = node.matches('math') ? node.outerHTML : node.querySelector?.('math')?.outerHTML || '';
      if (!latex.trim() && !mathml) continue;
      const holder = document.createElement('span');
      holder.dataset.wfcMath = '1';
      if (latex.trim()) holder.dataset.wfcLatex = latex.trim();
      if (mathml) holder.dataset.wfcMathml = mathml;
      holder.dataset.wfcDisplay = (node.matches('script') && /mode=display/.test(node.type)) || node.closest('.katex-display,mjx-container[display="true"]') ? 'block' : 'inline';
      node.replaceWith(holder);
      mathCount++;
    }
    // Pair original elements with their clones without relying on IDs or page JS variables.
    for (const [original, target] of matchingClone('img')) {
      const candidates = [original.getAttribute('data-src'),original.getAttribute('data-original'),original.getAttribute('data-actualsrc'),original.getAttribute('data-backupsrc'),original.currentSrc,original.getAttribute('src')].map(absolute).filter(Boolean);
      const unique = [...new Set(candidates)].filter(s => !/^data:image\/(?:gif|png);base64,R0lGOD|^data:image\/gif;base64,R0lGOD/.test(s));
      const url = unique.find(s => /^https:/.test(s)) || unique.find(s => /^http:/.test(s)) || unique[0] || ''; 
      register(target,{kind:'image',url,candidates:unique,alt:original.alt||'',width:original.naturalWidth||0,height:original.naturalHeight||0,mathCandidate:isMathImage(original),captureId:captureId(original)});
      if (url) target.setAttribute('src',url);
      target.removeAttribute('srcset');
      target.removeAttribute('data-src');
      target.removeAttribute('data-original');
    }
    for (const [original, target] of matchingClone('svg')) {
      if (!clone.contains(target)) continue;
      const content = new XMLSerializer().serializeToString(original);
      const alt = original.getAttribute('aria-label') || original.querySelector('title')?.textContent || 'SVG 图形';
      const img = document.createElement('img');
      target.replaceWith(img);
      register(img,{kind:'svg',inline:content,alt});
    }
    for (const [original,target] of matchingClone('canvas')) {
      if (!clone.contains(target)) continue;
      let dataUrl = '';
      try { dataUrl = original.toDataURL('image/png'); } catch(e) { warnings.push('Canvas 像素不可读取，已保留原始 HTML 中的画布节点：' + String(e.message)); }
      if (dataUrl && dataUrl.length < 12_000_000) {
        const img = document.createElement('img'); target.replaceWith(img);
        register(img,{kind:'canvas',url:dataUrl,alt:'Canvas 图像'});
      } else {
        target.setAttribute('data-wfc-canvas-failed','true');
      }
    }
    // Detect decorative assets referenced in inline and computed CSS.
    let backgrounds = 0;
    for (const orig of originalElements) {
      const target=originalToClone.get(orig);
      if (!target || !clone.contains(target) || target.hasAttribute('data-wfc-asset')) continue;
      if (!['SECTION','DIV','SPAN','P','FIGURE','TD'].includes(orig.tagName)) continue;
      const css=orig.getAttribute('style')||'';
      if (!/background(?:-image)?\s*:/.test(css)) continue;
      const match=css.match(/background(?:-image)?\s*:[^;]*?url\(\s*['"]?([^'"\)]+)['"]?\s*\)/i);
      if (!match) continue;
      const url=absolute(match[1]); if (!url) continue;
      if (++backgrounds>60) {warnings.push('背景图片超过 60 张，余下布局以原始 HTML 备份');break;}
      const image=document.createElement('img'); image.alt='装饰背景图';
      image.setAttribute('data-wfc-decorative','1');
      register(image,{kind:'background',url,alt:'装饰背景图',captureId:captureId(orig)});
      target.prepend(image);
    }
    // Record significant visual layout blocks and keep their original layout semantics.
    for (const orig of originalElements) {
      const target=originalToClone.get(orig);
      if(!target || !clone.contains(target) || target===clone) continue;
      if(!['SECTION','DIV','FIGURE','ASIDE','TABLE'].includes(orig.tagName)) continue;
      const computed=getComputedStyle(orig);
      const css=(orig.getAttribute('style')||'');
      const isSpecial=/display\s*:\s*(?:flex|grid|inline-flex)|column-count\s*:|position\s*:\s*absolute/i.test(css) || ['flex','grid','inline-flex'].includes(computed.display);
      if(!isSpecial) continue;
      // Avoid identifying every nested layout wrapper in the page as meaningful.
      const text=(orig.innerText||'').trim();
      if(text.length<2 && !orig.querySelector('img,svg,canvas')) continue;
      if(visuals.length>=120){warnings.push('超过 120 个复杂布局对象，后续内容保留在原始 DOM');break;}
      const id='layout-'+(++visualCounter);
      target.dataset.wfcLayoutId=id;
      if(!target.hasAttribute('style')) target.setAttribute('style','');
      const carry=['display','flexDirection','flexWrap','alignItems','justifyContent','gap','gridTemplateColumns','gridTemplateRows','textAlign','backgroundColor','borderRadius','padding','margin'];
      for(const key of carry) {
        if(!target.style[key] && computed[key] && computed[key]!=='normal' && computed[key]!=='none') target.style[key]=computed[key];
      }
      visuals.push({id,captureId:captureId(orig),tag:orig.tagName,text:text.slice(0,200),style:target.getAttribute('style')});
    }
    // Keep external URL targets and their fragment IDs.
    for (const a of clone.querySelectorAll('a[href]')) {
      const uri=absolute(a.getAttribute('href'));
      if (uri) a.setAttribute('href',uri);
      else a.removeAttribute('href');
    }
    // Remove executable content from working HTML; originalDom is retained as inert .txt.
    for (const n of clone.querySelectorAll('script,noscript,form,input,button,textarea,object,embed')) n.remove();
    for (const el of [clone,...clone.querySelectorAll('*')]) {
      for (const attr of Array.from(el.attributes||[])) {
        if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
        if (['href','src','poster'].includes(attr.name) && /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
      }
    }
    return {
      title,account,author,published,url:location.href,extractedAt:new Date().toISOString(),
      html:clone.outerHTML, originalDom,
      source:{...source,math:mathCount,backgroundImages:backgrounds},
      assets,visuals,warnings
    };
  }
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.kind === 'WFC_SCROLL_CAPTURE') {
      try {
        const el=[...document.querySelectorAll('[data-wfc-capture-id]')].find(n=>n.dataset.wfcCaptureId===message.id);
        if(!el) throw Error('找不到截图对象');
        el.scrollIntoView({behavior:'instant',block:'center',inline:'center'});
        const r=el.getBoundingClientRect();
        sendResponse({ok:true,rect:{x:r.left,y:r.top,width:r.width,height:r.height},viewport:{width:innerWidth,height:innerHeight},scrollY,visible:r.width>0&&r.height>0});
      } catch(e){sendResponse({ok:false,error:String(e?.message||e)});}
      return false;
    }
    if (message?.kind !== 'WFC_EXTRACT') return;
    try { sendResponse({ok:true,article:extract()}); }
    catch(error) {sendResponse({ok:false,error:String(error?.message||error)});}
    return false;
  });
})();
