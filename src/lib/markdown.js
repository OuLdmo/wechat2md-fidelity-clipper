/* Conservative, dependency-free HTML -> GitHub-flavored Markdown renderer.
   Complicated constructs remain HTML rather than being flattened silently. */
const BLOCK = new Set(['P','DIV','SECTION','ARTICLE','HEADER','FOOTER','MAIN','H1','H2','H3','H4','H5','H6','UL','OL','LI','TABLE','PRE','BLOCKQUOTE','FIGURE','FIGCAPTION','HR','VIDEO','AUDIO','IFRAME','ASIDE','DETAILS']);
const whitespace = s => (s || '').replace(/[\t\n\r ]+/g,' ');
const escapeText = s => whitespace(s).replace(/([\\`*_[\]<>])/g,'\\$1');
const escapeLabel = s => whitespace(s).replace(/[\\\[\]]/g,'\\$&');
const mdTarget = s => String(s || '').replace(/\s/g,c=>encodeURIComponent(c)).replace(/\(/g,'%28').replace(/\)/g,'%29').replace(/</g,'%3C').replace(/>/g,'%3E');
const compact = s => String(s||'').replace(/\n[ \t]+\n/g,'\n\n').replace(/\n{3,}/g,'\n\n').trim();
const plain = el => whitespace(el?.textContent || '').trim();

export function isSafeUrl(uri) {
  if (!uri) return false;
  try { return ['https:','http:','mailto:','tel:'].includes(new URL(uri,'https://mp.weixin.qq.com').protocol) || /^#[^\s]+$/.test(uri); }
  catch { return false; }
}

/** Removes active content while preserving complex HTML for offline inspection. */
export function sanitizeElement(el) {
  for (const node of Array.from(el.querySelectorAll('script,noscript,object,embed,form,input,textarea,button,meta,link,base'))) node.remove();
  // Offline snapshots must not execute embedded webpages or auto-play media.
  for (const media of Array.from(el.querySelectorAll('iframe,video,audio'))) {
    const src=media.getAttribute('src')||media.querySelector('source[src]')?.getAttribute('src')||'';
    const a=media.ownerDocument.createElement('a');
    a.textContent='[原文嵌入媒体]';
    if(isSafeUrl(src)) a.setAttribute('href',src);
    media.replaceWith(a);
  }
  const nodes = [el,...el.querySelectorAll('*')];
  for (const node of nodes) {
    for (const attr of Array.from(node.attributes||[])) {
      const name = attr.name.toLowerCase(), v = attr.value.trim();
      if (name.startsWith('on') || ['srcdoc','formaction','integrity','nonce'].includes(name)) node.removeAttribute(attr.name);
      else if (['href','src','poster','xlink:href'].includes(name) && /^(?:javascript:|vbscript:|file:)/i.test(v)) node.removeAttribute(attr.name);
      else if (name === 'style' && /(?:expression\s*\(|-moz-binding|@import|url\(\s*['"]?javascript:)/i.test(v)) node.removeAttribute(attr.name);
    }
  }
  return el;
}

export function htmlToArticleDOM(html) {
  const documentRoot = new DOMParser().parseFromString(html, 'text/html');
  // The source is a root element; always wrap in a detached article to avoid transforming <html>/<body>.
  const main = documentRoot.body.firstElementChild || documentRoot.body;
  const root = documentRoot.createElement('article');
  root.setAttribute('data-wfc-root','1');
  if (main && main !== documentRoot.body) root.appendChild(main);
  else root.innerHTML = documentRoot.body.innerHTML;
  return sanitizeElement(root);
}

export function createRenderer(assetMap, options={}) {
  const issues = [];
  const counters={math:0,mathml:0,images:0,links:0,tables:0,complexTables:0,svg:0,code:0,media:0,complexLayouts:0,ocr:0};
  const referenceLinks=[];
  const asFile = (node) => {
    const id=node.getAttribute('data-wfc-asset');
    const asset=assetMap.get(id);
    return asset?.storedPath || asset?.url || node.getAttribute('src') || '';
  };
  function image(node) {
    const src=asFile(node);
    const asset=assetMap.get(node.getAttribute('data-wfc-asset'));
    const alt=escapeLabel(node.getAttribute('alt') || asset?.alt || '图片');
    counters.images++;
    if (asset?.kind==='svg') counters.svg++;
    if (!src) {issues.push({level:'error',type:'image',message:`图片缺失：${alt}`});return `**[图片缺失：${alt}]**`;}
    const imageMarkdown=`![${alt}](${mdTarget(src)})`;
    const ocr=options.ocrMap?.get(node.getAttribute('data-wfc-asset'));
    if(ocr?.latex){
      counters.ocr++;
      const safeLatex=ocr.latex.replace(/```/g,'` ` `');
      return ocr.verified
        ? `${imageMarkdown}\n\n> 已人工确认的公式转写：\n\n$$\n${safeLatex}\n$$`
        : `${imageMarkdown}\n\n> ⚠ 公式 OCR 候选（${ocr.engine}，未经人工核验；原图仍保留）\n\n\`\`\`latex\n${safeLatex}\n\`\`\``;
    }
    return imageMarkdown;
  }
  function math(node) {
    counters.math++;
    const latex=node.getAttribute('data-wfc-latex')?.trim();
    if (latex) {
      if (node.getAttribute('data-wfc-display')==='block') return `\n\n$$\n${latex}\n$$\n\n`;
      return `$${latex.replace(/\r?\n/g,' ')}$`;
    }
    const mml=node.getAttribute('data-wfc-mathml');
    if (mml) {
      counters.mathml++;
      issues.push({level:'warning',type:'math',message:'发现只有 MathML 没有原始 LaTeX 的公式，已保留 MathML。'});
      return `\n\n\`\`\`xml\n${mml.replace(/\`\`\`/g,'` ` `')}\n\`\`\`\n\n`;
    }
    issues.push({level:'error',type:'math',message:'无法恢复公式源码。'});
    return '**[公式需要复核]**';
  }
  function inline(node) {
    if (!node) return '';
    if (node.nodeType===3) return escapeText(node.nodeValue);
    if (node.nodeType!==1) return '';
    const tag=node.tagName;
    if (node.hasAttribute('data-wfc-math')) return math(node);
    if (tag==='IMG') return image(node);
    if (tag==='SVG') {issues.push({level:'warning',type:'svg',message:'检测到未本地化的 SVG，HTML 快照可供复核。'});return '[SVG图形]';}
    if (tag==='BR') return '  \n';
    if (tag==='WBR') return '';
    if (tag==='CODE') return '`'+(node.textContent||'').replace(/`/g,'``')+'`';
    if (tag==='MATH') return node.outerHTML;
    if (tag==='SUP'||tag==='SUB') return `<${tag.toLowerCase()}>${escapeText(plain(node))}</${tag.toLowerCase()}>`;
    const inside=Array.from(node.childNodes).map(inline).join('');
    const txt=inside.trim();
    if (['STRONG','B'].includes(tag)) return txt?`**${txt}**`:'';
    if (['EM','I'].includes(tag)) return txt?`*${txt}*`:'';
    if (['DEL','S','STRIKE'].includes(tag)) return txt?`~~${txt}~~`:'';
    if (tag==='A') {
      const href=node.getAttribute('href');
      if (!href || !isSafeUrl(href)) return inside;
      counters.links++;
      referenceLinks.push({text:plain(node),href});
      return `[${txt||escapeLabel(href)}](${mdTarget(href)})`;
    }
    if (tag==='SPAN' && /font-weight:\s*(?:bold|[6-9]00)/i.test(node.getAttribute('style')||'')) return txt?`**${txt}**`:'';
    if (tag==='SPAN' && /font-style:\s*italic/i.test(node.getAttribute('style')||'')) return txt?`*${txt}*`:'';
    return inside;
  }
  function code(node) {
    counters.code++;
    const child=node.querySelector('code');
    const cls=child?.className||'';
    const lang=/language-([\w+-]+)/.exec(cls)?.[1]||'';
    const raw=(child || node).textContent.replace(/\n$/,'');
    const fence='`'.repeat(Math.max(3, ...Array.from(raw.matchAll(/`+/g),m=>m[0].length+1),3));
    return `${fence}${lang}\n${raw}\n${fence}`;
  }
  function table(node) {
    counters.tables++;
    const rows=Array.from(node.querySelectorAll('tr'));
    const cells=rows.map(row=>Array.from(row.children).filter(c=>['TH','TD'].includes(c.tagName)));
    const merged=cells.some(row=>row.some(cell=>Number(cell.getAttribute('rowspan')||1)!==1||Number(cell.getAttribute('colspan')||1)!==1));
    const rich=cells.some(row=>row.some(cell=>cell.querySelector('table,img,svg,ul,ol,pre,div,p,[data-wfc-math]')));
    const equalWidth=cells.length&&cells[0].length&&cells.every(row=>row.length===cells[0].length);
    if (merged||rich||!equalWidth) {
      counters.complexTables++;
      issues.push({level:'info',type:'table',message:'复杂表格保留为 HTML，避免合并单元格或内容结构损失。'});
      return options.html===false? `[复杂表格：见 source/article.html]\n\n${plain(node)}`:node.outerHTML;
    }
    if (!cells.length) return '';
    const values=cells.map(row=>row.map(cell=>Array.from(cell.childNodes).map(inline).join('').replace(/\n/g,' ').replace(/\|/g,'\\|').trim()));
    const n=cells[0].length;
    const header=values[0];
    const align=cells[0].map((cell,i)=>{
      const alignValue=(cell.getAttribute('align') || cell.style?.textAlign || '').toLowerCase();
      return alignValue==='right'?'---:':alignValue==='center'?':---:':'---';
    });
    return ['| '+header.join(' | ')+' |','| '+align.join(' | ')+' |',...values.slice(1).map(row=>'| '+row.join(' | ')+' |')].join('\n');
  }
  function media(node) {
    counters.media++;
    const kind={VIDEO:'视频',AUDIO:'音频',IFRAME:'嵌入媒体'}[node.tagName]||'媒体';
    const src=node.getAttribute('src')||node.querySelector('source[src]')?.getAttribute('src')||'';
    issues.push({level:'info',type:'media',message:`${kind}未做二进制归档，已保留可用链接和 HTML 快照。`});
    return src&&isSafeUrl(src)?`[${kind}](${mdTarget(src)})`:`[${kind}，见 HTML 快照]`;
  }
  function renderChildren(node, depth) {
    let pending='';const output=[];
    const flush=()=>{const str=pending.trim();if(str) output.push(str);pending='';};
    for (const child of node.childNodes) {
      if (child.nodeType===1 && (BLOCK.has(child.tagName)||child.hasAttribute('data-wfc-math')&&child.getAttribute('data-wfc-display')==='block')) {
        flush();const result=block(child,depth);if(result.trim()) output.push(result.trim());
      } else pending+=inline(child);
    }
    flush();
    return output.join('\n\n');
  }
  function renderList(node, depth) {
    const ordered=node.tagName==='OL';
    let idx=Number(node.getAttribute('start')||1);
    const lines=[];
    for (const li of node.children) {
      if (li.tagName!=='LI') continue;
      let main='';const nested=[];
      for (const child of li.childNodes) {
        if (child.nodeType===1 && (child.tagName==='UL'||child.tagName==='OL')) nested.push(child);
        else if (child.nodeType===1 && BLOCK.has(child.tagName)) main+=' '+block(child,depth+1).replace(/\n{2,}/g,'\n');
        else main+=inline(child);
      }
      const prefix=ordered?`${idx++}. `:'- ';
      const text=compact(main).replace(/\n/g,'\n'+' '.repeat(prefix.length));
      lines.push(' '.repeat(depth*2)+prefix+text);
      for(const sub of nested) lines.push(renderList(sub,depth+1));
    }
    return lines.join('\n');
  }
  function block(node,depth=0) {
    const tag=node.tagName;
    if (node.hasAttribute('data-wfc-math')) return math(node).trim();
    if (tag==='IMG') return image(node);
    if (tag==='HR') return '---';
    if (/^H[1-6]$/.test(tag)) return '#'.repeat(Number(tag[1]))+' '+Array.from(node.childNodes).map(inline).join('').trim();
    if (tag==='PRE') return code(node);
    if (tag==='TABLE') return table(node);
    if (tag==='UL'||tag==='OL') return renderList(node,depth);
    if (tag==='BLOCKQUOTE') return compact(renderChildren(node,depth)).split('\n').map(line=>line?'> '+line:'>').join('\n');
    if (['VIDEO','AUDIO','IFRAME'].includes(tag)) return media(node);
    if (tag==='FIGCAPTION') return '*'+Array.from(node.childNodes).map(inline).join('').trim()+'*';
    if (tag==='P') {
      const children=Array.from(node.childNodes);
      if (children.some(n=>n.nodeType===1&&BLOCK.has(n.tagName))) return renderChildren(node,depth);
      return children.map(inline).join('').trim();
    }
    if (node.hasAttribute('data-wfc-canvas-failed')) {issues.push({level:'warning',type:'canvas',message:'无法读取 Canvas，已保留 DOM 快照。'});return '[Canvas 图：见原始 HTML 快照]';}
    const css=node.getAttribute('style')||'';
    if(node.hasAttribute('data-wfc-layout-id') && options.html!==false) {
      counters.complexLayouts++;
      // Keep the actual HTML for flex/grid content. Its images have been rewritten
      // to local paths by archive.js, preserving the order and multi-column grouping.
      const previewId=node.getAttribute('data-wfc-layout-asset');
      const visual=previewId ? assetMap.get(previewId) : null;
      if(visual?.storedPath) return node.outerHTML+`\n\n> 原始版式截图：![版式截图](${mdTarget(visual.storedPath)})`;
      return node.outerHTML;
    }
    if (/(?:display\s*:\s*(?:flex|grid)|column-count\s*:|position\s*:\s*absolute)/i.test(css)) counters.complexLayouts++;
    return renderChildren(node,depth);
  }
  function render(root) {
    const markdown=compact(block(root));
    if (counters.complexLayouts) issues.push({level:'info',type:'layout',message:`检测到 ${counters.complexLayouts} 处复杂 CSS 布局，Markdown 不完全保留其视觉外观；已提供 HTML 快照。`});
    return {markdown,counters,issues,referenceLinks};
  }
  return {render};
}

export function yamlString(s) {return JSON.stringify(String(s??'').replace(/[\u0000-\u001f]/g,c=>c==='\n'?' ':''));}
export function normalizeText(s) {return String(s||'').replace(/\s+/g,'').replace(/[\p{P}\p{S}]/gu,'');}
