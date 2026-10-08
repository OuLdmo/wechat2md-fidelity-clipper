/* Standalone export formats built from the EXACT ZIP artifact used in the archive.
 * No second article fetch or conversion: modes only change asset representation.
 */
const dataMime = mime => /^(image\/(?:png|jpeg|gif|webp|avif|svg\+xml|bmp|x-icon))$/i.test(mime||'');
const guessMime = file => ({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',svg:'image/svg+xml',bmp:'image/bmp',ico:'image/x-icon'})[(file||'').split('.').pop().toLowerCase()]||'';
function base64(bytes){
  // Chunked conversion prevents stack overflow with large images.
  let binary='';
  for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
  return btoa(binary);
}
async function zipFrom(output){
  if(!globalThis.JSZip)throw new Error('JSZip 尚未加载');
  return globalThis.JSZip.loadAsync(output.blob);
}
function targetEscaped(s){return String(s||'').replace(/\s/g,c=>encodeURIComponent(c)).replace(/\(/g,'%28').replace(/\)/g,'%29').replace(/</g,'%3C').replace(/>/g,'%3E');}
function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function rewriteMarkdown(md,record,url){
  const path=record.file;
  if(!path || !url) return md;
  // Rewrite exact Markdown image/link destinations and HTML attributes only;
  // do not blindly replace occurrences inside prose or code snippets.
  const pathVariants=[path,targetEscaped(path)];
  for(const pathValue of new Set(pathVariants)){
    md=md.replaceAll(`](${pathValue})`,`](${targetEscaped(url)})`);
    md=md.replaceAll(`src="${pathValue}"`,`src="${escapeHtml(url)}"`);
    md=md.replaceAll(`src='${pathValue}'`,`src='${escapeHtml(url)}'`);
  }
  return md;
}
function removeBrokenArchiveLink(md){
  return md.replace(/^\[原文 HTML 排版快照\]\(source\/article\.html\)\s*$/gm,'').replace(/\n{3,}/g,'\n\n').trimEnd()+'\n';
}
export async function markdownVariant(output, mode='raw', {maxInlineBytes=65*1024*1024}={}) {
  if(mode==='raw')return output.markdown;
  if(!['remote','inline'].includes(mode))throw new Error('未知 Markdown 导出模式');
  const zip=await zipFrom(output);
  let md=output.markdown,bytesAdded=0,unavailable=[];
  for(const r of output.resourceManifest){
    if(!r.file)continue;
    let target='';
    if(mode==='remote' && /^(https?:\/\/|data:image\/)/i.test(r.sourceUrl||''))target=r.sourceUrl;
    if(!target){
      const entry=zip.file(r.file);
      if(!entry){unavailable.push(r.id);continue;}
      const bytes=await entry.async('uint8array');
      const mime=dataMime(r.mime)?r.mime:guessMime(r.file);
      if(!mime){unavailable.push(r.id);continue;}
      bytesAdded+=bytes.byteLength;
      if(bytesAdded>maxInlineBytes)throw new Error(`内嵌图片总量超过 ${Math.round(maxInlineBytes/1024/1024)} MB；请改选 ZIP 离线归档。`);
      target=`data:${mime};base64,${base64(bytes)}`;
    }
    md=rewriteMarkdown(md,r,target);
  }
  if(unavailable.length)md+=`\n<!-- 单文件导出存在无法内嵌的资源：${unavailable.join(', ')}。请使用 ZIP 归档。 -->\n`;
  return removeBrokenArchiveLink(md);
}
export function articlePlainText(output){
  const html=output.sourcePreview||'';
  const doc=new DOMParser().parseFromString(html,'text/html');
  // Source snapshot is sanitized by the archiver. Still produce text only.
  const blockTags=new Set(['P','DIV','SECTION','H1','H2','H3','H4','H5','H6','LI','TR','BLOCKQUOTE','PRE','TABLE','FIGURE','FIGCAPTION','ARTICLE','BR']);
  const chunks=[];
  function visit(node){
    if(node.nodeType===3){chunks.push(node.nodeValue||'');return;}
    if(node.nodeType!==1)return;
    if(node.tagName==='IMG'){chunks.push(` [图片：${node.getAttribute('alt')||'无描述'}] `);return;}
    if(node.tagName==='SVG'){chunks.push(' [SVG图形] ');return;}
    const block=blockTags.has(node.tagName);
    if(block)chunks.push('\n');
    for(const c of node.childNodes)visit(c);
    if(node.tagName==='A'){
      const href=node.getAttribute('href');
      if(href && /^https?:\/\//i.test(href) && !chunks.slice(-3).join('').includes(href))chunks.push(` (${href})`);
    }
    if(block)chunks.push('\n');
  }
  visit(doc.body);
  const plain=chunks.join('').replace(/[\t ]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  return `${output.quality?.articleTitle||doc.title||'公众号文章'}\n\n${plain}\n\n原文链接：${output.quality?.sourceUrl||''}\n`;
}
export async function printableHtml(output){
  const zip=await zipFrom(output);
  const original=await zip.file('source/article.html')?.async('string');
  if(!original)throw new Error('没有 HTML 快照，请启用“保留 HTML”选项后重试');
  const doc=new DOMParser().parseFromString(original,'text/html');
  const manifestFile=zip.file('manifest.json');
  let metadata={};
  try{if(manifestFile)metadata=JSON.parse(await manifestFile.async('string')).article||{};}catch{}
  const banner=doc.createElement('header');
  banner.setAttribute('class','wfc-article-header');
  const title=doc.createElement('h1');title.textContent=metadata.title||doc.title||'公众号文章';
  const byline=doc.createElement('p');byline.className='wfc-article-meta';
  byline.textContent=[metadata.account,metadata.author,metadata.published].filter(Boolean).join(' · ');
  banner.append(title,byline);
  if(/^https:\/\//.test(metadata.url||'')){
    const source=doc.createElement('p');source.className='wfc-article-meta';
    const anchor=doc.createElement('a');anchor.textContent='原文链接';anchor.href=metadata.url;
    source.append(anchor);banner.append(source);
  }
  doc.body.prepend(banner);
  const toData=new Map();
  for(const r of output.resourceManifest){
    if(!r.file)continue;
    const bytes=await zip.file(r.file)?.async('uint8array');
    if(!bytes)continue;
    const mime=dataMime(r.mime)?r.mime:guessMime(r.file);
    if(!mime)continue;
    toData.set('../'+r.file,`data:${mime};base64,${base64(bytes)}`);
  }
  for(const img of doc.querySelectorAll('img[src]')){
    const src=img.getAttribute('src');
    if(toData.has(src))img.setAttribute('src',toData.get(src));
    img.removeAttribute('loading');
  }
  for(const el of doc.querySelectorAll('[style]')){
    let style=el.getAttribute('style')||'';
    for(const [from,data] of toData)style=style.replaceAll(from,data);
    el.setAttribute('style',style);
  }
  // CSP deliberately prevents scripts, remote frames and external CSS in the print view.
  const csp=doc.createElement('meta');csp.httpEquiv='Content-Security-Policy';
  csp.content="default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src data:";
  doc.head.prepend(csp);
  const css=doc.createElement('style');
  css.textContent=`.wfc-article-header{margin:0 0 30px;border-bottom:1px solid #ddd;padding:0 0 16px}.wfc-article-header h1{font-size:24pt;line-height:1.3;margin:0 0 6px}.wfc-article-meta{font-size:10pt;color:#555;margin:4px 0}@page{size:A4;margin:15mm 13mm}body{max-width:920px!important;margin:0 auto!important;padding:0!important;font-family:system-ui,'Microsoft YaHei',sans-serif!important;font-size:12pt!important;line-height:1.65!important;color:#111}img,svg{max-width:100%!important;height:auto;break-inside:avoid}table,figure,blockquote,pre{break-inside:avoid}a{color:#145ca3}h1,h2,h3{break-after:avoid}p{orphans:2;widows:2}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}`;
  doc.head.append(css);
  // Avoid leaking interactive input into print.
  for(const el of doc.querySelectorAll('script,iframe,form,button,input,textarea,video,audio'))el.remove();
  return '<!doctype html>\n'+doc.documentElement.outerHTML;
}
export async function previewAssetData(output,maxBytes=15*1024*1024){
  const zip=await zipFrom(output), data=new Map();
  let used=0;
  for(const r of output.resourceManifest){
    if(!r.file || !zip.file(r.file))continue;
    const bytes=await zip.file(r.file).async('uint8array');
    if(used+bytes.length>maxBytes)continue;
    const mime=dataMime(r.mime)?r.mime:guessMime(r.file);
    if(!mime)continue;
    used+=bytes.length;
    data.set(r.file,`data:${mime};base64,${base64(bytes)}`);
  }
  return data;
}
