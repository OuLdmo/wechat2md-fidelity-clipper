import {buildArchive} from './lib/archive.js';
import {captureNode} from './lib/capture.js';
import {markdownPreview} from './lib/preview.js';
import {markdownVariant,articlePlainText,printableHtml,previewAssetData} from './lib/formats.js';
import {savePrintDocument} from './lib/print-store.js';

const $=id=>document.getElementById(id);
let controller=null;
let busy=false;
let pendingOrigins=[];
let lastArticle=null,lastOptions=null,lastOutput=null;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function message(text,progress=null){$('status').textContent=text;if(progress!=null) $('bar').style.width=Math.round(progress*100)+'%';}
function setBusy(value){
  busy=value;
  $('convert').disabled=value;
  $('url').disabled=value;
  $('useTab').disabled=value;
  $('cancel').classList.toggle('hidden',!value);
  $('convert').textContent=value?'正在处理…':'一键转换并导出';
}
function getOptions(){
  const opts=Object.fromEntries(['images','math','html','report'].map(k=>[k,$(k).checked]));
  opts.exportMode=document.querySelector('input[name="exportMode"]:checked').value;
  opts.ocrScope=$('ocrScope').value;
  opts.imageMode=document.querySelector('input[name="imageMode"]:checked').value;
  opts.ocr={engine:$('ocrEngine').value,appId:$('mathpixId').value.trim(),appKey:$('mathpixKey').value.trim()};
  return opts;
}
function safePreviewHtml(output) {
  // Side-panel preview can use original remote URLs, while the exported HTML
  // retains portable relative file paths.
  const doc=new DOMParser().parseFromString(output.sourcePreview,'text/html');
  for(const node of doc.querySelectorAll('[data-wfc-asset]')) {
    const entry=output.resourceManifest.find(r=>r.id===node.dataset.wfcAsset);
    if(entry?.sourceUrl&&/^https?:\/\//.test(entry.sourceUrl)&&node.tagName==='IMG') node.setAttribute('src',entry.sourceUrl);
  }
  const csp=doc.createElement('meta');csp.setAttribute('http-equiv','Content-Security-Policy');
  csp.setAttribute('content',"default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'; font-src data:;");
  doc.head.prepend(csp);
  return '<!doctype html>'+doc.documentElement.outerHTML;
}
async function showCompare(article,output) {
  $('compare').classList.remove('hidden');
  $('sourceFrame').srcdoc=safePreviewHtml(output);
  $('markdownPreview').textContent=output.markdown;
  const localData=await previewAssetData(output).catch(()=>new Map());
  $('markdownFrame').srcdoc=markdownPreview(output.markdown,output.resourceManifest,localData);
  const check=output.quality.checks.paragraphTextCheck;
  $('compareStats').textContent=`正文核验：${check.exactNormalizedMatches}/${check.assessed} 段匹配；资源 ${output.quality.exported.archiveAssets} 已保存，${output.quality.exported.failedAssets} 失败；视觉差异需人工核验。`;
  $('diffIssues').replaceChildren();
  const flagged=output.quality.issues.filter(x=>['text-coverage','math-ocr','layout','table','asset','canvas'].includes(x.type));
  for(const issue of flagged.slice(0,40)){
    const li=document.createElement('li');li.textContent=`${issue.type}：${issue.message}`;$('diffIssues').appendChild(li);
  }
  if(!flagged.length){const li=document.createElement('li');li.textContent='未发现已检查范围内的文本结构异常。请对照双栏检查图片和排版。';$('diffIssues').appendChild(li);}
  $('ocrReview').replaceChildren();
  for(const entry of output.quality.formulaOcr||[]){
    const label=document.createElement('label');label.textContent=`${entry.assetId} / ${entry.engine}${entry.verified?' / 已人工确认':' / 待人工确认'}`;
    const input=document.createElement('textarea');input.dataset.ocrId=entry.assetId;input.value=entry.latex;
    $('ocrReview').append(label,input);
  }
  if(!output.quality.formulaOcr?.length){const p=document.createElement('p');p.className='hint';p.textContent='无 OCR 候选（文章可能无可识别的公式图片，或未启用 OCR）。';$('ocrReview').append(p);}
}
async function prepareScreenshots(tabId,article,options){
  if(options.imageMode!=='screenshot') return;
  const all=article.assets.filter(x=>['image','background'].includes(x.kind));
  for(let i=0;i<all.length;i++){
    if(controller.signal.aborted) throw Error('已取消');
    const a=all[i];message(`正在截图图片 ${i+1}/${all.length}`,0.08+0.05*(i+1)/Math.max(all.length,1));
    try{
      const shot=await captureNode(tabId,a.captureId);
      a.screenshotDataUrl=shot.dataUrl;
      if(shot.clipped) article.warnings.push(`${a.id} 截图存在视口裁切，原图 URL 已保留供校验。`);
    }catch(error){article.warnings.push(`${a.id} 截图失败：${String(error.message||error)}；保留原图 URL。`);}
  }
}
function validUrl(input){
  const u=new URL(input.trim());
  if(u.protocol!=='https:'||u.hostname!=='mp.weixin.qq.com'|| !/^\/s(?:\/|$)/.test(u.pathname)) throw new Error('请输入 https://mp.weixin.qq.com/s/... 格式的公众号文章 URL。');
  return u.href;
}
async function extractArticle(tabId) {
  let lastError='正文尚未加载';
  for(let i=0;i<12;i++){
    if(controller?.signal.aborted) throw new Error('任务已取消');
    try {
      await chrome.scripting.executeScript({target:{tabId},files:['extractor.js']});
      const reply=await chrome.tabs.sendMessage(tabId,{kind:'WFC_EXTRACT'});
      if(reply?.ok) return reply.article;
      lastError=reply?.error||lastError;
      if(/找不到公众号|尚未加载/.test(lastError)) {await wait(650);continue;}
      throw new Error(lastError);
    } catch(err) {
      lastError=String(err.message||err);
      if(/Receiving end does not exist|Frame with ID|Cannot access|No tab with id|was removed/i.test(lastError)) await wait(650);
      else if(i>=3 && !/正文|尚未加载/.test(lastError)) throw err;
      else await wait(650);
    }
  }
  throw new Error(`文章提取失败：${lastError}。请检查文章在浏览器中是否能正常阅读。`);
}
async function getOrOpenArticleTab(url){
  const tabs=await chrome.tabs.query({});
  const existing=tabs.find(t=>t.url===url);
  if(existing?.id!=null) return existing.id;
  const tab=await chrome.tabs.create({url,active:true});
  if(tab.id==null) throw new Error('无法打开文章标签页');
  for(let i=0;i<30;i++){
    if(controller?.signal.aborted) throw new Error('任务已取消');
    const curr=await chrome.tabs.get(tab.id);
    if(curr.status==='complete') break;
    await wait(500);
  }
  return tab.id;
}
function displayQuality(quality){
  $('summary').classList.remove('hidden');
  $('stats').replaceChildren();
  const items=[['源正文字符',quality.source.textCharacters||0],['已保存资源',quality.exported.archiveAssets],['下载失败资源',quality.exported.failedAssets],['输出链接',quality.exported.linksRendered],['公式',quality.exported.mathRendered],['复杂表格',quality.exported.complexTableHtmlFallbacks]];
  for(const [name,value] of items){const div=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;dd.textContent=String(value);div.append(dt,dd);$('stats').append(div);}
  $('issues').replaceChildren();
  for(const i of quality.issues.slice(0,30)){const li=document.createElement('li');li.textContent=`[${i.level}] ${i.message}`;$('issues').append(li);}
  if(!quality.issues.length){const li=document.createElement('li');li.textContent='未发现已检测范围内的异常，但不代表所有视觉细节均无损。';$('issues').append(li);}
  if(quality.issues.length>30){const li=document.createElement('li');li.textContent=`另外 ${quality.issues.length-30} 条记录详见 quality-report.json`;$('issues').append(li);}
}
async function saveDownload(blob,filename){
  const url=URL.createObjectURL(blob);
  try {
    const downloadId=await chrome.downloads.download({url,filename,saveAs:true,conflictAction:'uniquify'});
    if(downloadId==null) throw new Error('浏览器未创建下载任务');
    // Keep object URL valid until Chrome has finished reading it.
    const onChanged=change=>{
      if(change.id!==downloadId) return;
      if(change.state?.current==='complete'||change.state?.current==='interrupted'){
        chrome.downloads.onChanged.removeListener(onChanged);
        URL.revokeObjectURL(url);
      }
    };
    chrome.downloads.onChanged.addListener(onChanged);
  }catch(error){
    const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    message(`已尝试通过浏览器下载：${filename}（下载 API 提示：${error.message||error}）`,1);
  }

}
async function prepareLayoutScreenshots(tabId,article,options){
  if(options.imageMode!=='screenshot' || options.html===false)return;
  // Capture representative flex/grid sections as visual fallbacks without
  // replacing editable text and HTML in the Markdown file.
  const dom=new DOMParser().parseFromString(article.html,'text/html');
  for(const v of (article.visuals||[]).slice(0,20)){
    if(controller.signal.aborted) throw Error('已取消');
    try{
      const shot=await captureNode(tabId,v.captureId);
      const id=`asset-${article.assets.length+1}`;
      article.assets.push({id,kind:'layout',url:shot.dataUrl,alt:'原图文版式截图',screenshotDataUrl:shot.dataUrl});
      const target=dom.querySelector(`[data-wfc-layout-id="${v.id}"]`);
      if(target) target.setAttribute('data-wfc-layout-asset',id);
      if(shot.clipped) article.warnings.push(`复杂排版 ${v.id} 的截图发生视口裁切。`);
    }catch(error){article.warnings.push(`复杂排版 ${v.id} 截图失败：${String(error.message||error)}`);}
  }
  article.html=dom.body.firstElementChild?.outerHTML||article.html;
}
function fileTitle(output){
  return String(output.quality?.articleTitle||output.filename.replace(/\.zip$/i,'')||'公众号文章').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').trim().slice(0,75)||'公众号文章';
}
async function exportResult(output,mode){
  const base=fileTitle(output);
  if(mode==='zip'){
    await saveDownload(output.blob,output.filename);
    return `ZIP 归档已提交下载：${output.filename}`;
  }
  if(mode==='link'||mode==='inline'){
    const md=await markdownVariant(output,mode==='link'?'remote':'inline');
    await saveDownload(new Blob([md],{type:'text/markdown;charset=utf-8'}),`${base}${mode==='inline'?'-内嵌图片':''}.md`);
    return `Markdown 已提交下载：${mode==='link'?'图片原始链接':'图片 Data URI 内嵌'}`;
  }
  if(mode==='pdf'){
    const html=await printableHtml(output);
    const id=await savePrintDocument(html);
    await chrome.tabs.create({url:chrome.runtime.getURL('print.html')+'?id='+encodeURIComponent(id),active:true});
    return '已打开离线 PDF 打印预览，请点击「打印 / 保存为 PDF」，并选择「另存为 PDF」。';
  }
  throw Error('不支持该导出模式');
}
async function writeClipboard(content){
  try{await navigator.clipboard.writeText(content);}
  catch(e){
    const textarea=document.createElement('textarea');textarea.value=content;
    document.body.append(textarea);textarea.select();
    const ok=document.execCommand('copy');textarea.remove();
    if(!ok)throw new Error('浏览器拒绝剪贴板写入：'+String(e?.message||e));
  }
}
async function copyWithFeedback(fn,description){
  if(!lastOutput){message('请先转换一篇文章');return;}
  try{await fn();message(`已复制：${description}`);}
  catch(e){message('复制失败：'+String(e?.message||e));}
}
async function convert(){
  if(busy)return;
  let url;
  try{url=validUrl($('url').value);}catch(err){message(err.message,0);return;}
  controller=new AbortController();
  setBusy(true);
  $('summary').classList.add('hidden');
  message('正在打开文章…',.02);
  try{
    const options=getOptions();
    if(options.math && options.ocr.engine!=='off') {
      const origin=options.ocr.engine==='mathpix'?'https://api.mathpix.com/*':'http://127.0.0.1:8765/*';
      const granted=await chrome.permissions.request({origins:[origin]});
      if(!granted) throw Error('没有 OCR 服务访问权限；可以改为不开启 OCR 继续归档。');
    }
    // Never store OCR keys; these only live in the current side-panel session.
    await chrome.storage.local.set({lastUrl:url,options:{images:options.images,math:options.math,html:options.html,report:options.report,imageMode:options.imageMode,exportMode:options.exportMode,ocrEngine:options.ocr.engine,ocrScope:options.ocrScope}});
    const tabId=await getOrOpenArticleTab(url);
    message('正在分析网页 DOM、图片、公式与引用…',.06);
    const article=await extractArticle(tabId);
    message(`已识别：${article.title}；准备离线归档…`,.1);
    const core=new Set(['mp.weixin.qq.com','mmbiz.qpic.cn','mmbiz.qlogo.cn']);
    pendingOrigins=[...new Set((article.assets||[]).flatMap(a=>[a.url,...(a.candidates||[])]).filter(Boolean).flatMap(u=>{
      try{const parsed=new URL(u);return parsed.protocol==='https:'&&!core.has(parsed.hostname)?[`https://${parsed.hostname}/*`]:[];}
      catch{return [];}
    }))].slice(0,20);
    $('grantOrigins').textContent=`授权 ${pendingOrigins.length} 个第三方图片域名并重新转换（可选）`;
    $('grantOrigins').classList.toggle('hidden',pendingOrigins.length===0);
    // Prepare screenshots only for the ZIP screenshot mode; other modes retain original assets.
    if(options.exportMode==='zip') await prepareScreenshots(tabId,article,options);
    if(options.exportMode==='zip') await prepareLayoutScreenshots(tabId,article,options);
    const archiveOptions={...options,imageMode:options.exportMode==='zip'?options.imageMode:'local'};
    const output=await buildArchive(article,archiveOptions,message,controller);
    lastArticle=article;lastOptions=options;lastOutput=output;
    await showCompare(article,output);
    if(controller.signal.aborted) throw new Error('任务已取消');
    const resultMessage=await exportResult(output,options.exportMode);
    displayQuality(output.quality);
    message(resultMessage+' 失败资源详见质量报告。',1);
  }catch(err){
    console.error('WFC convert failed',err);
    message(`转换未完成：${String(err?.message||err)}`,0);
  }finally {controller=null;setBusy(false);}
}
$('convert').addEventListener('click',convert);
$('grantOrigins').addEventListener('click',()=>{
  if(!pendingOrigins.length) return;
  // User gesture directly invokes Chrome's per-host permission prompt.
  chrome.permissions.request({origins:pendingOrigins}).then(granted=>{
    message(granted?'授权已完成。请再次点击「转换并下载」，重试第三方资源。':'未授权；资源仍会保留外链及失败记录。');
  }).catch(e=>message('授权失败：'+String(e?.message||e)));
});
$('cancel').addEventListener('click',()=>{controller?.abort();message('正在取消…');});
$('useTab').addEventListener('click',async()=>{
  try{
    const tabs=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tabs[0]?.url) throw new Error('无法读取当前页链接');
    $('url').value=validUrl(tabs[0].url);
    message('已填入当前公众号文章链接');
  }catch(err){message(String(err.message||err));}
});
async function initialize(){
  try{
    const stored=await chrome.storage.local.get(['lastUrl','options']);
    if(stored.lastUrl) $('url').value=stored.lastUrl;
    for(const [key,value] of Object.entries(stored.options||{})) if(['images','math','html','report'].includes(key)&&$(key)) $(key).checked=!!value;
    const chosen=document.querySelector(`input[name="imageMode"][value="${stored.options?.imageMode||'local'}"]`);
    if(chosen) chosen.checked=true;
    const exportRadio=document.querySelector(`input[name="exportMode"][value="${stored.options?.exportMode||'zip'}"]`);
    if(exportRadio)exportRadio.checked=true;
    $('ocrEngine').value=stored.options?.ocrEngine||'off';
    $('ocrScope').value=stored.options?.ocrScope||'marked';
    $('mathpixFields').classList.toggle('hidden',$('ocrEngine').value!=='mathpix');
    if(!$('url').value){
      const tabs=await chrome.tabs.query({active:true,currentWindow:true});
      if(tabs[0]?.url?.startsWith('https://mp.weixin.qq.com/s')) $('url').value=tabs[0].url;
    }
  }catch(err){message(`初始化配置失败：${err.message||err}`);}
}
initialize();

$('ocrEngine').addEventListener('change',()=>{
  $('mathpixFields').classList.toggle('hidden',$('ocrEngine').value!=='mathpix');
});
$('exportRevised').addEventListener('click',async()=>{
  if(busy||!lastArticle||!lastOptions)return;
  const ocrOverrides=Object.fromEntries([...$('ocrReview').querySelectorAll('textarea[data-ocr-id]')]
    .filter(t=>t.value.trim()).map(t=>[t.dataset.ocrId,t.value.trim()]));
  setBusy(true);controller=new AbortController();
  try {
    message('应用公式人工校正，重新生成归档…',.05);
    const output=await buildArchive(lastArticle,{...lastOptions,imageMode:lastOptions.exportMode==='zip'?lastOptions.imageMode:'local',ocrOverrides,ocr:{engine:'off'}},message,controller);
    lastOutput=output;await showCompare(lastArticle,output);displayQuality(output.quality);
    const notice=await exportResult(output,lastOptions.exportMode);
    message('人工复核版本：'+notice,1);
  }catch(e){message(`重新导出失败：${String(e.message||e)}`);}finally{setBusy(false);controller=null;}
});

$('toggleMarkdown').addEventListener('click',()=>{
  const showSource=$('markdownPreview').classList.contains('hidden');
  $('markdownPreview').classList.toggle('hidden',!showSource);
  $('markdownFrame').classList.toggle('hidden',showSource);
  $('toggleMarkdown').textContent=showSource?'排版预览':'查看源码';
});

for(const [button,mode] of [['exportLink','link'],['exportInline','inline'],['exportZip','zip'],['exportPdf','pdf']]){
  $(button).addEventListener('click',async()=>{
    if(busy||!lastOutput){message('请先转换一篇文章');return;}
    try{message('正在生成另一种导出格式…');message(await exportResult(lastOutput,mode),1);}
    catch(e){message('导出失败：'+String(e?.message||e));}
  });
}
$('copyText').addEventListener('click',()=>copyWithFeedback(()=>writeClipboard(articlePlainText(lastOutput)),'纯文本正文'));
$('copyMarkdown').addEventListener('click',()=>copyWithFeedback(()=>writeClipboard(lastOutput.markdown),'Markdown 原格式（ZIP 本地路径）'));
$('copyMarkdownRemote').addEventListener('click',()=>copyWithFeedback(async()=>writeClipboard(await markdownVariant(lastOutput,'remote')),'独立 Markdown（图片外链或 SVG 内嵌）'));
$('copyMarkdownInline').addEventListener('click',()=>copyWithFeedback(async()=>writeClipboard(await markdownVariant(lastOutput,'inline')),'独立 Markdown（图片 Data URI 内嵌）'));
$('copyRich').addEventListener('click',()=>copyWithFeedback(async()=>{
  if(!navigator.clipboard.write||typeof ClipboardItem==='undefined')throw Error('当前浏览器不支持富文本剪贴板');
  const html=await printableHtml(lastOutput);
  const text=articlePlainText(lastOutput);
  await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([text],{type:'text/plain'})})]);
},'富文本（含 HTML 与纯文本）'));
