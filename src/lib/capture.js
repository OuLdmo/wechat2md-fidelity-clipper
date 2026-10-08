// Capture is tied to the active tab and user-initiated export. Never use a remote screenshot API.
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let lastCapture=0;
export async function captureNode(tabId, captureId) {
  const tab=await chrome.tabs.get(tabId);
  if(!tab.id || !captureId) throw Error('截图缺少文章节点');
  await chrome.tabs.update(tabId,{active:true});
  const reply=await chrome.tabs.sendMessage(tabId,{kind:'WFC_SCROLL_CAPTURE',id:captureId});
  if(!reply?.ok||!reply.visible) throw Error(reply?.error||'图片元素不在可见区域');
  // Lazy-loaded WeChat images may only finish loading after scrolling.
  await delay(280);
  const elapsed=Date.now()-lastCapture;
  if(elapsed<650) await delay(650-elapsed);
  const uri=await chrome.tabs.captureVisibleTab(tab.windowId,{format:'png'});
  lastCapture=Date.now();
  const bitmap=await createImageBitmap(await (await fetch(uri)).blob());
  const {rect,viewport}=reply;
  const ratioX=bitmap.width/viewport.width,ratioY=bitmap.height/viewport.height;
  const left=Math.max(0,Math.floor(rect.x*ratioX));
  const top=Math.max(0,Math.floor(rect.y*ratioY));
  const right=Math.min(bitmap.width,Math.ceil((rect.x+rect.width)*ratioX));
  const bottom=Math.min(bitmap.height,Math.ceil((rect.y+rect.height)*ratioY));
  if(right<=left||bottom<=top) throw Error('目标超出截图视口');
  const canvas=document.createElement('canvas');
  canvas.width=right-left;canvas.height=bottom-top;
  canvas.getContext('2d').drawImage(bitmap,left,top,canvas.width,canvas.height,0,0,canvas.width,canvas.height);
  bitmap.close();
  const clipped=rect.x<0||rect.y<0||rect.x+rect.width>viewport.width||rect.y+rect.height>viewport.height;
  return {dataUrl:canvas.toDataURL('image/png'),clipped,width:canvas.width,height:canvas.height};
}
