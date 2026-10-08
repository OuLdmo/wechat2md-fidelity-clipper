import {htmlToArticleDOM, createRenderer, yamlString, normalizeText, isSafeUrl} from './markdown.js';
import {recognizeFormula} from './ocr.js';

function extensionFor(mime,url,kind) {
  if(kind==='svg') return '.svg';
  if(kind==='canvas') return '.png';
  const types={'image/jpeg':'.jpg','image/png':'.png','image/gif':'.gif','image/webp':'.webp','image/avif':'.avif','image/svg+xml':'.svg','image/bmp':'.bmp','image/tiff':'.tif','image/x-icon':'.ico'};
  const cleanMime=(mime||'').split(';')[0].trim().toLowerCase();
  if(types[cleanMime]) return types[cleanMime];
  const part=/\.(jpe?g|png|gif|webp|avif|svg|bmp|ico)(?:[?#]|$)/i.exec(url||'');
  return part ? '.'+part[1].toLowerCase().replace('jpeg','jpg') : '.bin';
}
function fileStem(kind,index){return `${kind==='svg'?'svg':kind==='canvas'?'canvas':kind==='background'?'background':kind==='layout'?'layout':'img'}-${String(index+1).padStart(4,'0')}`;}
const byteLength=s=>new TextEncoder().encode(s).byteLength;
async function sha256(data){const result=await crypto.subtle.digest('SHA-256',data);return [...new Uint8Array(result)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function dataUrlBytes(url) {
  const comma=url.indexOf(','); if(comma<0) throw new Error('无效的数据 URL');
  const encoding=url.slice(0,comma);
  const data=url.slice(comma+1);
  if (/;base64/i.test(encoding)) {
    const decoded=atob(data.replace(/\s/g,''));
    const bytes=new Uint8Array(decoded.length);
    for(let i=0;i<bytes.length;i++) bytes[i]=decoded.charCodeAt(i);
    return {bytes,mime:/^data:([^;,]+)/i.exec(encoding)?.[1]||'application/octet-stream'};
  }
  return {bytes:new TextEncoder().encode(decodeURIComponent(data)),mime:/^data:([^;,]+)/i.exec(encoding)?.[1]||'application/octet-stream'};
}
function safeSvg(raw) {
  const d=new DOMParser().parseFromString(raw,'image/svg+xml');
  if(d.querySelector('parsererror') || d.documentElement.localName!=='svg') throw new Error('SVG 源码格式无效');
  for(const node of [...d.querySelectorAll('script,foreignObject,iframe,object,embed')]) node.remove();
  for(const node of [d.documentElement,...d.querySelectorAll('*')]) {
    for(const attr of [...node.attributes]) {
      if(/^on/i.test(attr.name) || ['href','xlink:href'].includes(attr.name.toLowerCase())&& !attr.value.startsWith('#') || /(?:javascript:|url\(\s*['"]?https?:)/i.test(attr.value))node.removeAttribute(attr.name);
    }
  }
  d.documentElement.setAttribute('xmlns','http://www.w3.org/2000/svg');
  return new XMLSerializer().serializeToString(d.documentElement);
}
function archiveFilename(input){
  const safe=String(input||'公众号文章').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/\s+/g,' ').trim().slice(0,75);
  return safe||'公众号文章';
}
function buildHtml(root,title) {
  const page=new DOMParser().parseFromString('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title></title><style>body{max-width:800px;margin:40px auto;padding:0 20px;color:#222;font:16px/1.8 system-ui,sans-serif;overflow-wrap:anywhere}img,svg,video{max-width:100%;height:auto}table{border-collapse:collapse;display:block;overflow:auto}td,th{border:1px solid #ddd;padding:6px 10px}pre{white-space:pre-wrap;overflow-wrap:anywhere}blockquote{border-left:3px solid #aaa;padding-left:16px;color:#666}</style></head><body></body></html>','text/html');
  page.title=title;
  const copy=page.importNode(root,true);
  for(const link of copy.querySelectorAll('a[href]')) {
    if(!isSafeUrl(link.getAttribute('href')))link.removeAttribute('href');
    else {link.setAttribute('rel','noopener noreferrer');link.setAttribute('target','_blank');}
  }
  page.body.appendChild(copy);
  return '<!doctype html>\n'+page.documentElement.outerHTML;
}
function htmlSnapshot(root,title){return buildHtml(root,title);}
async function retrieveAsset(asset, controller, maxBytes) {
  if (asset.kind==='svg') {
    return {bytes:new TextEncoder().encode(safeSvg(asset.inline||'')),mime:'image/svg+xml'};
  }
  if(asset.screenshotDataUrl) {
    const shot=dataUrlBytes(asset.screenshotDataUrl);
    return {...shot,finalUrl:'browser-visible-tab-capture'};
  }
  const choices=[asset.url,...(asset.candidates||[])].filter(Boolean);
  const urls=[...new Set(choices.flatMap(u=>{
    if(/^http:\/\/mmbiz\.(?:qpic|qlogo)\.cn\//i.test(u)) return [u.replace(/^http:/i,'https:'),u];
    return [u];
  }))];
  if(!urls.length) throw new Error('资源链接为空');
  let lastError='';
  for(const url of urls) {
    if(controller?.signal.aborted) throw new Error('任务已取消');
    try {
      if(/^data:/i.test(url)) return {...dataUrlBytes(url),finalUrl:url};
      const u=new URL(url);
      if (!['http:','https:'].includes(u.protocol)) throw new Error('不支持的资源协议');
      const response=await fetch(u.href,{signal:controller?.signal,credentials:'omit',referrerPolicy:'no-referrer',cache:'default'});
      if(!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
      const length=Number(response.headers.get('content-length')||0);
      if(length>maxBytes) throw new Error(`单个资源超过 ${Math.round(maxBytes/1024/1024)}MB`);
      if(contentType && !/^image\//.test(contentType) && !['application/octet-stream','binary/octet-stream'].includes(contentType)) throw new Error(`非图片类型：${contentType}`);
      const buffer=await response.arrayBuffer();
      if(buffer.byteLength>maxBytes) throw new Error('资源体积超过安全上限');
      if(!buffer.byteLength) throw new Error('空文件');
      return {bytes:new Uint8Array(buffer),mime:contentType,finalUrl:u.href};
    } catch(error){
      if(controller?.signal.aborted) throw error;
      lastError=String(error?.message||error);
    }
  }
  throw new Error(`全部 ${urls.length} 个资源候选均失败；最后错误：${lastError}`);
}

function titleHeader(article){
  const lines=['---',`title: ${yamlString(article.title)}`,`account: ${yamlString(article.account)}`,`author: ${yamlString(article.author)}`,`published: ${yamlString(article.published)}`,`source: ${yamlString(article.url)}`,`clipped_at: ${yamlString(article.extractedAt)}`,`converter: ${yamlString('WeChat Fidelity Clipper v0.3.0')}`,'---',''];
  return lines.join('\n');
}
function fileJson(obj){return JSON.stringify(obj,null,2)+'\n';}
/**
 * All conversion/ZIP generation happens inside the extension side-panel. No remote backend.
 * @param {object} article Extractor payload, made from a DOM accessible to the user
 * @param {object} options features switches
 * @param {(phase:string,progress:number)=>void} progress callback
 * @param {AbortController} controller task cancellation controller
 */
export async function buildArchive(article,options={},progress=()=>{},controller=new AbortController()){
  if (!globalThis.JSZip) throw new Error('JSZip 归档库未加载');
  const zip=new globalThis.JSZip();
  const issues=(article.warnings||[]).map(message=>({level:'warning',type:'extraction',message}));
  const records=[];
  const map=new Map();
  const candidates=article.assets||[];
  const downloads=new Map();
  const resourceBytes=new Map();
  const ocrResults=[];
  const selectedMode=options.imageMode||'local';
  let completed=0, totalBytes=0;
  const maxSingleBytes=75*1024*1024;
  const maxTotalBytes=250*1024*1024;
  // Concurrent fetches avoid blocking the user on large illustrated articles.
  let cursor=0;
  async function worker(){
    while(cursor<candidates.length){
      if(controller.signal.aborted) throw new Error('用户已取消转换');
      const idx=cursor++;
      const a=candidates[idx];
      const record={id:a.id,kind:a.kind,downloadedFrom:null,sourceUrl:a.url||'',candidates:a.candidates||[],alt:a.alt||'',originalWidth:a.width||0,originalHeight:a.height||0,status:'pending',file:null,sha256:null,bytes:0,mime:null,error:null};
      records[idx]=record;
      const info={...a,storedPath:null};map.set(a.id,info);
      try {
        if (options.images===false || (selectedMode==='remote' && a.kind!=='svg' && a.kind!=='canvas')){
          record.status='external';
          record.error=null;
          continue;
        }
        if(selectedMode==='screenshot' && a.kind==='image' && !a.screenshotDataUrl){
          issues.push({level:'warning',type:'screenshot',id:a.id,message:`${a.id} 截图不可用，尝试下载原始图片作为离线回退。`});
        }
        const cacheKey=selectedMode==='screenshot' && a.kind==='image' ? a.id : a.url;
        if(cacheKey && downloads.has(cacheKey)){
          const cached=await downloads.get(cacheKey);
          Object.assign(record,{status:'saved',file:cached.file,sha256:cached.sha256,bytes:cached.bytes,mime:cached.mime,downloadedFrom:cached.downloadedFrom});
          info.storedPath=cached.file;
          resourceBytes.set(a.id,cached.rawBytes);
        } else {
          const operation=(async()=>{
            const result=await retrieveAsset(a,controller,maxSingleBytes);
            if(totalBytes+result.bytes.byteLength>maxTotalBytes) throw new Error('归档资源总量超过 250 MB 的安全上限');
            totalBytes+=result.bytes.byteLength;
            const ext=extensionFor(result.mime,a.url,a.kind);
            const folder=a.kind==='svg'?'assets/figures':a.kind==='canvas'?'assets/figures':a.kind==='layout'?'assets/layouts':'assets/images';
            const file=`${folder}/${fileStem(a.kind,idx)}${ext}`;
            const digest=await sha256(result.bytes);
            zip.file(file,result.bytes,{binary:true});
            return {file,sha256:digest,bytes:result.bytes.byteLength,mime:result.mime,downloadedFrom:result.finalUrl||null,rawBytes:result.bytes};
          })();
          if(cacheKey) downloads.set(cacheKey,operation);
          const data=await operation;
          Object.assign(record,{status:'saved',file:data.file,sha256:data.sha256,bytes:data.bytes,mime:data.mime,downloadedFrom:data.downloadedFrom});
          info.storedPath=data.file;
          resourceBytes.set(a.id,data.rawBytes);
        }
      } catch(error){
        if(controller.signal.aborted) throw error;
        record.status='failed';record.error=String(error?.message||error);
        issues.push({level:'warning',type:'asset',id:a.id,message:`资源 ${a.id} 保存失败：${record.error}${a.url?'（已保留外链）':''}`});
      } finally {completed++;progress(`资源归档 ${completed}/${candidates.length}`,0.12+0.6*completed/Math.max(1,candidates.length));}
    }
  }
  progress('分析正文与外部资源',0.08);
  await Promise.all(Array.from({length:Math.min(4,candidates.length)},worker));
  // OCR is opt-in. No guessed expression ever replaces its source image.
  const engine=options.ocr?.engine||'off';
  const mathCandidates=candidates.filter(a=>a.kind==='image' && (a.mathCandidate || options.ocrScope==='all'));
  for(const a of mathCandidates){
    if(controller.signal.aborted) throw new Error('任务已取消');
    const record=records.find(r=>r.id===a.id);
    const override=options.ocrOverrides?.[a.id];
    if(typeof override==='string' && override.trim()) {
      const item={assetId:a.id,latex:override.trim(),engine:'manual',verified:true,confidence:null};
      ocrResults.push(item);
      zip.file(`assets/equations/${a.id}.json`,fileJson(item));
      continue;
    }
    if(!options.math||engine==='off') continue;
    const bytes=resourceBytes.get(a.id);
    if(!bytes) {issues.push({level:'warning',type:'math-ocr',id:a.id,message:'公式图片没有本地像素数据；OCR 跳过，保留原图/外链。'});continue;}
    try{
      progress(`公式 OCR：${a.id}`,0.73);
      const item=await recognizeFormula(a,bytes,record.mime,options.ocr,controller.signal);
      ocrResults.push(item);
      zip.file(`assets/equations/${a.id}.json`,fileJson(item));
      issues.push({level:'warning',type:'math-ocr',id:a.id,message:`${a.id} 已生成 ${engine} OCR 候选，未人工核验，原图仍保留。`});
    } catch(err){
      if(controller.signal.aborted) throw err;
      issues.push({level:'warning',type:'math-ocr',id:a.id,message:`${a.id} OCR 失败：${String(err.message||err)}`});
    }
  }
  progress('构建 Markdown 和 HTML 快照',0.76);
  const root=htmlToArticleDOM(article.html);
  const rootHtml=htmlToArticleDOM(article.html);
  for(const img of root.querySelectorAll('[data-wfc-asset]')){
    const item=map.get(img.getAttribute('data-wfc-asset'));
    const path=item?.storedPath||item?.url||'';
    if(path && img.tagName==='IMG') img.setAttribute('src',path);
    img.removeAttribute('srcset');
  }
  for(const img of rootHtml.querySelectorAll('[data-wfc-asset]')){
    const item=map.get(img.getAttribute('data-wfc-asset'));
    const path=item?.storedPath?'../'+item.storedPath:item?.url||'';
    if(path&&img.tagName==='IMG') img.setAttribute('src',path);
    img.removeAttribute('srcset');
  }
  // HTML snapshot must show math as readable text rather than empty renderer spans.
  for (const holder of rootHtml.querySelectorAll('[data-wfc-math]')) {
    const latex=holder.getAttribute('data-wfc-latex');
    const mml=holder.getAttribute('data-wfc-mathml');
    if(latex) {
      const code=rootHtml.ownerDocument.createElement('code');
      code.textContent=(holder.getAttribute('data-wfc-display')==='block'?'[LaTeX] ':'')+latex;
      holder.replaceWith(code);
    } else if(mml) {
      const code=rootHtml.ownerDocument.createElement('code');
      code.textContent='[MathML] '+mml;
      holder.replaceWith(code);
    }
  }
  const ocrMap=new Map(ocrResults.map(x=>[x.assetId,x]));
  const renderer=createRenderer(map,{...options,ocrMap});
  const rendered=renderer.render(root);
  issues.push(...rendered.issues);
  const markdown=titleHeader(article)+`# ${article.title.replace(/[\r\n]/g,' ').replace(/([\\`*_[\]<>])/g,'\\$1')}\n\n`+rendered.markdown+'\n\n---\n\n'+`原文链接：${article.url}\n\n`+(options.html!==false?'[原文 HTML 排版快照](source/article.html)\n':'');
  // Conservative paragraph-level text coverage check (not semantic equivalence).
  const markdownPlain=normalizeText(markdown.replace(/\]\([^)]*\)/g,']').replace(/\\([\[\]`*_])/g,'$1'));
  const paragraphs=[...root.querySelectorAll('p')].filter(p=>!p.querySelector('img,table,[data-wfc-math]') && normalizeText(p.textContent).length>=7);
  const lostParagraphs=paragraphs.filter(p=>!markdownPlain.includes(normalizeText(p.textContent)));
  for (const p of lostParagraphs.slice(0,10)) issues.push({level:'warning',type:'text-coverage',message:'段落文本在 Markdown 中未找到完全匹配的规范化结果：'+p.textContent.trim().slice(0,70)});
  const imageRecords=records.filter(x=>['image','background','canvas','svg','layout'].includes(x.kind));
  const saved=imageRecords.filter(x=>x.status==='saved').length;
  const missed=imageRecords.filter(x=>x.status==='failed').length;
  const external=imageRecords.filter(x=>x.status==='external').length;
  const quality={
    version:'0.3.0',imageMode:selectedMode,sourceUrl:article.url,articleTitle:article.title,archiveCreatedAt:new Date().toISOString(),
    source:article.source,
    exported:{markdownBytes:byteLength(markdown),archiveAssets:saved,failedAssets:missed,externalAssets:external,formulaOcrCandidates:mathCandidates.length,formulaOcrProduced:ocrResults.length,imagesEmitted:rendered.counters.images,linksRendered:rendered.counters.links,mathRendered:rendered.counters.math,mathmlFallbacks:rendered.counters.mathml,tables:rendered.counters.tables,complexTableHtmlFallbacks:rendered.counters.complexTables,complexCssLayouts:rendered.counters.complexLayouts,mediaLinkFallbacks:rendered.counters.media},
    checks:{
      sourceLinkCount:article.source.links,
      paragraphTextCheck:{assessed:paragraphs.length,exactNormalizedMatches:paragraphs.length-lostParagraphs.length,reviewRequired:lostParagraphs.length},
      linkStructureCheck:rendered.counters.links>=article.source.links?'pass':'review',
      assetsVerified:imageRecords.length && missed===0?'pass':missed?'review':'not_applicable',
      sourceTextCharacters:article.source.textCharacters,
      // Structural metric only; there is no claim of semantic equivalence.
      convertedTextCharacters:normalizeText(root.textContent).length,
      sourceDOMAvailable:!!article.originalDom,
      htmlSnapshotAvailable:options.html!==false,
      mathOcrEnabled:engine!=='off',
      formulaOcrVerified:ocrResults.filter(x=>x.verified).length,
      formulaOcrUnverified:ocrResults.filter(x=>!x.verified).length,
      pixelPerfectLayoutGuaranteed:false
    },
    issues,
    preservedReferences:rendered.referenceLinks,
    formulaOcr:ocrResults,
    visualLayouts:article.visuals||[],
    note:'此报告检查资源与结构，不构成图像内容、公式语义或视觉排版完全无损的证明。'
  };
  if(options.html!==false) {
    zip.file('source/article.html',htmlSnapshot(rootHtml,article.title));
    zip.file('source/original-dom.html.txt',article.originalDom||'');
  }
  const sourcePreview=htmlSnapshot(rootHtml,article.title);
  // The raw source URL is always retained in manifest for audit.
  zip.file('article.md',markdown);
  zip.file('manifest.json',fileJson({version:'0.3.0',imageMode:selectedMode,article:{title:article.title,account:article.account,author:article.author,published:article.published,url:article.url,extractedAt:article.extractedAt},resources:records}));
  if(options.report!==false) zip.file('quality-report.json',fileJson(quality));
  zip.file('README.txt',`WeChat Fidelity Clipper 归档\n\n主文件：article.md\n离线资源：assets/\nHTML 快照：source/article.html\n原始 DOM：source/original-dom.html.txt（请作为文本查看，不执行）\n质量报告：quality-report.json\n\n不能访问的图片将以在线 URL 留在 Markdown 中，并记录在 manifest.json 中。\n`);
  progress('生成 ZIP 压缩包',0.91);
  const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:5},streamFiles:true},metadata=>{
    progress(`正在压缩：${Math.round(metadata.percent||0)}%`,0.91+0.09*(metadata.percent||0)/100);
  });
  progress('归档完成',1);
  return {blob,filename:archiveFilename(article.title)+'.zip',quality,markdown,sourcePreview,resourceManifest:records};
}
