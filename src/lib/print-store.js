const DB_NAME='wfc-print-docs';
const STORE='documents';
function openDB(){return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB_NAME,1);
  req.onupgradeneeded=()=>req.result.createObjectStore(STORE,{keyPath:'id'});
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error);
});}
export async function savePrintDocument(html){
  const id=crypto.randomUUID();const db=await openDB();
  try{await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put({id,html,created:Date.now()});
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });return id;}finally{db.close();}
}
export async function loadPrintDocument(id){
  const db=await openDB();try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readonly');const req=tx.objectStore(STORE).get(id);
    req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);
  });}finally{db.close();}
}
