// Small offline Markdown preview tailored to generated WFC markdown.
// This is a readability aid, not a full CommonMark/GFM conformance engine.
import {isSafeUrl, htmlToArticleDOM} from './markdown.js';
const escape=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function inline(raw,resources,localData){
  let s=escape(raw);
  s=s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,(_m,alt,link)=>{
    let src=link;
    const resource=resources.find(x=>x.file===link||`../${x.file}`===link);
    if(localData?.has(resource?.file)) src=localData.get(resource.file);
    else if(resource?.sourceUrl) src=resource.sourceUrl;
    return /^(https?:\/\/|data:image\/)/.test(src)?`<img loading="lazy" alt="${escape(alt)}" src="${escape(src)}">`:`<span class="placeholder">[图片资源：${escape(alt)}]</span>`;
  });
  s=s.replace(/\[([^\]]+)\]\(([^)]+)\)/g,(_m,label,link)=>{
    const uri=link.replaceAll('&amp;','&');
    return isSafeUrl(uri)?`<a target="_blank" rel="noopener noreferrer" href="${escape(uri)}">${label}</a>`:label;
  });
  s=s.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>');
  return s;
}
export function markdownPreview(markdown,resources=[],localData=null){
  let input=String(markdown||'').replace(/^---\n[\s\S]*?\n---\n/,'');
  const lines=input.split(/\r?\n/),out=[];
  let fence=false,fenceText=[],latex=false,mathText=[];
  let htmlBlock='',htmlEnd='';
  for(let i=0;i<lines.length;i++){
    const line=lines[i],trim=line.trim();
    if(htmlEnd){
      htmlBlock+=line+'\n';
      if(trim.includes(htmlEnd)){out.push(htmlBlock);htmlBlock='';htmlEnd='';}
      continue;
    }
    if(/^<(section|div|table|figure|aside|article)\b/i.test(trim)){
      const tag=/^<(section|div|table|figure|aside|article)\b/i.exec(trim)[1];
      const end=`</${tag}>`;
      if(trim.includes(end)) out.push(line);
      else {htmlBlock=line+'\n';htmlEnd=end;}
      continue;
    }
    if(/^```/.test(trim)){if(fence){out.push(`<pre><code>${escape(fenceText.join('\n'))}</code></pre>`);fence=false;fenceText=[];}else fence=true;continue;}
    if(fence){fenceText.push(line);continue;}
    if(trim==='$$'){if(latex){out.push(`<div class="math-expression">${escape(mathText.join('\n'))}</div>`);latex=false;mathText=[];}else latex=true;continue;}
    if(latex){mathText.push(line);continue;}
    if(!trim)continue;
    const heading=/^(#{1,6})\s+(.+)$/.exec(trim);
    if(heading){const level=Math.min(heading[1].length,6);out.push(`<h${level}>${inline(heading[2],resources,localData)}</h${level}>`);continue;}
    if(/^>\s?/.test(trim)){out.push(`<blockquote>${inline(trim.replace(/^>\s?/,''),resources,localData)}</blockquote>`);continue;}
    if(/^\|.+\|$/.test(trim)){out.push(`<pre class="table-preview">${escape(trim)}</pre>`);continue;}
    if(/^\s*(?:-|\*|\d+\.)\s+/.test(line)){out.push(`<p class="bullet">${inline(line,resources,localData)}</p>`);continue;}
    if(trim==='---'){out.push('<hr>');continue;}
    out.push(`<p>${inline(trim,resources,localData)}</p>`);
  }
  if(htmlBlock)out.push(`<pre>${escape(htmlBlock)}</pre>`);
  const markup=out.join('\n');
  const root=htmlToArticleDOM(`<article>${markup}</article>`);
  for(const node of root.querySelectorAll('img[src]')){
    let src=node.getAttribute('src')||'';
    const record=resources.find(x=>x.file===src||`../${x.file}`===src);
    if(localData?.has(record?.file)){src=localData.get(record.file);node.setAttribute('src',src);}
    else if(record?.sourceUrl){src=record.sourceUrl;node.setAttribute('src',src);}
    if(!/^(https?:\/\/|data:image\/)/.test(src))node.removeAttribute('src');
  }
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'"><style>body{max-width:760px;margin:18px auto;padding:0 14px;font:14px/1.7 system-ui,sans-serif;color:#202833;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%;overflow:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 monospace;background:#f3f7fc;padding:10px}blockquote{margin:9px 0;padding:3px 9px;border-left:3px solid #b3c9e0;background:#f4f8fb}h1{font-size:22px}h2{font-size:18px}h3{font-size:16px}p{margin:6px 0 13px}.math-expression{white-space:pre-wrap;padding:10px;background:#f5f4ed;font:12px/1.5 monospace}.placeholder{color:#b45e32}</style></head><body>${root.innerHTML}</body></html>`;
}
