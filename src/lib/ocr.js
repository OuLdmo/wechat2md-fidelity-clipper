/** OCR never overwrites the original image. Returned latex is an unverified suggestion. */
function asDataUrl(bytes,mime) {
  let binary='';const chunk=16384;
  for(let i=0;i<bytes.length;i+=chunk) binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
  return `data:${mime&&mime.startsWith('image/')?mime:'image/png'};base64,`+btoa(binary);
}
function extractLatex(text){
  let s=String(text||'').trim();
  const patterns=[/^\$\$([\s\S]*)\$\$$/,/^\\\[([\s\S]*)\\\]$/, /^\\\(([\s\S]*)\\\)$/];
  for(const re of patterns){const m=s.match(re);if(m){s=m[1].trim();break;}}
  return s.length<=12000?s:'';
}
export async function recognizeFormula(asset,bytes,mime,ocr,signal){
  const src=asDataUrl(bytes,mime);
  let res;
  if(ocr.engine==='mathpix'){
    if(!ocr.appId||!ocr.appKey) throw Error('Mathpix 需要 app_id 与 app_key');
    // Mathpix JSON base64 request limit: 2 MB source image.
    if(src.length>2*1024*1024) throw Error('公式超过 Mathpix Base64 大小限制');
    res=await fetch('https://api.mathpix.com/v3/text',{method:'POST',signal,headers:{'Content-Type':'application/json',app_id:ocr.appId,app_key:ocr.appKey},body:JSON.stringify({src,formats:['text'],math_inline_delimiters:['\\(','\\)'],math_display_delimiters:['\\[','\\]']})});
  } else if(ocr.engine==='local'){
    res=await fetch('http://127.0.0.1:8765/ocr',{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({image:src})});
  } else throw Error('未选择 OCR 引擎');
  if(!res.ok) throw Error(`OCR 服务返回 HTTP ${res.status}: ${(await res.text()).slice(0,180)}`);
  const result=await res.json();
  const latex=extractLatex(result.latex||result.text);
  if(!latex) throw Error('OCR 未返回可识别公式');
  return {latex,engine:ocr.engine,confidence:result.confidence??null,verified:false,assetId:asset.id};
}
