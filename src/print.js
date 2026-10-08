import {loadPrintDocument} from './lib/print-store.js';
const $=id=>document.getElementById(id);
$('printButton').addEventListener('click',()=>window.print());
(async()=>{
  const id=new URL(location.href).searchParams.get('id');
  if(!id)throw Error('缺少打印任务 ID');
  const record=await loadPrintDocument(id);
  if(!record)throw Error('找不到已生成的打印快照。请重新从扩展导出。');
  const parsed=new DOMParser().parseFromString(record.html,'text/html');
  for(const node of parsed.querySelectorAll('script,iframe,form,button,input,textarea,video,audio,object,embed'))node.remove();
  for(const el of [parsed.body,...parsed.body.querySelectorAll('*')]){
    for(const attr of [...el.attributes||[]]){
      if(/^on/i.test(attr.name)||['srcdoc','formaction'].includes(attr.name.toLowerCase()) || /^(?:javascript:|vbscript:)/i.test(attr.value))el.removeAttribute(attr.name);
    }
  }
  document.title=parsed.title||'公众号文章';
  for(const style of parsed.head.querySelectorAll('style')){
    const copy=document.createElement('style');copy.textContent=style.textContent;document.head.append(copy);
  }
  const frag=document.createDocumentFragment();
  for(const child of [...parsed.body.childNodes])frag.appendChild(document.importNode(child,true));
  $('content').replaceChildren(frag);
  $('printStatus').textContent=`已载入：${document.title}`;
  $('printButton').disabled=false;
})().catch(err=>{$('printStatus').textContent='加载失败：'+String(err.message||err);});
