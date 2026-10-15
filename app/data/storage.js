// Storage has no analysis dependencies. The landing page can confirm whether
// a workspace exists without downloading the research application.
export function workspaceStorage(pathname=''){
 const scope=/^\/jianwei-observatory-preview(?:\/|$)/.test(pathname)?'gemini-preview':'';
 return {scope,database:'hengji-evidence-workspace'+(scope?'-'+scope:''),prefix:'hengji'+(scope?'-'+scope:'')+':'};
}
// The Pages preview shares an origin with production. Its documents and workers
// must use the same isolated namespace, including on reload and background work.
const {scope:STORAGE_SCOPE,database:DB,prefix:localPrefix}=workspaceStorage(globalThis.location?.pathname||'');
export {STORAGE_SCOPE};
const TABLE='materials';
export const PREPARED_VERSION=46;
export function preference(key,fallback){try{return JSON.parse(localStorage.getItem(localPrefix+key))??fallback;}catch{return fallback;}}
export function remember(key,value){try{localStorage.setItem(localPrefix+key,JSON.stringify(value));return true;}catch{return false;}}
function open(name=DB){return new Promise((resolve,reject)=>{
 const req=indexedDB.open(name,1);let done=false;
 const timer=setTimeout(()=>finish(new Error('本机存储暂时没有响应')),3500);
 function finish(error,result){if(done){result?.close();return;}done=true;clearTimeout(timer);error?reject(error):resolve(result);}
 req.onupgradeneeded=()=>{if(name===DB&&!req.result.objectStoreNames.contains(TABLE))req.result.createObjectStore(TABLE);};
 req.onsuccess=()=>finish(null,req.result);req.onerror=()=>finish(req.error||new Error('无法打开本机存储'));req.onblocked=()=>finish(new Error('本机数据被另一个页面占用'));
});}
export async function access(key,value,write=false,name=DB,table=TABLE,entries=null){
 const db=await open(name);if(!db.objectStoreNames.contains(table)){db.close();return null;}
 return new Promise((resolve,reject)=>{let tx,result=null,done=false;
  const timer=setTimeout(()=>{try{tx?.abort();}catch{}finish(new Error('本机存储操作超时，内容未保存'));},4500);
  function finish(error){if(done)return;done=true;clearTimeout(timer);db.close();error?reject(error):resolve(result);}
  try{tx=db.transaction(table,write?'readwrite':'readonly');tx.oncomplete=()=>finish();tx.onerror=()=>finish(tx.error||new Error('本机存储写入失败'));tx.onabort=()=>finish(tx.error||new Error('本机存储事务已取消，内容未保存'));
   if(write)for(const [k,v] of entries||[[key,value]])tx.objectStore(table).put(v,k);
   else if(Array.isArray(key)){result={};for(const k of key){const r=tx.objectStore(table).get(k);r.onsuccess=()=>{result[k]=r.result??null;};}}
   else{const r=tx.objectStore(table).get(key);r.onsuccess=()=>{result=r.result??null;};}
  }catch(error){try{tx?.abort();}catch{}finish(error);}
 });
}
let writes=Promise.resolve();
function savedHint(entries){const data=entries.find(([key])=>key==='dataset')?.[1];if(data)remember('workspacePresent',Boolean(data.scores?.length||data.answers?.length||data.lines?.length||Object.keys(data.banks||{}).length));}
export function write(entries){const snapshot=structuredClone(entries),operation=writes.then(()=>access(null,null,true,DB,TABLE,snapshot)).then(result=>{savedHint(snapshot);return result;});writes=operation.catch(()=>{});return operation;}
export function writePrepared(entries){const ready=Promise.resolve(entries);ready.catch(()=>{});const operation=writes.then(async()=>{const entries=await ready,result=await access(null,null,true,DB,TABLE,entries);savedHint(entries);return result;});writes=operation.catch(()=>{});return operation;}
export async function readWorkspace(){
 let current=null;try{current=await access(['dataset','prepared']);}catch{}
 if(current?.dataset)return {dataset:current.dataset,prepared:current.prepared?.version===PREPARED_VERSION,stamp:current.prepared?.stamp??null,origin:'saved'};
 if(STORAGE_SCOPE){remember('workspacePresent',false);return {dataset:null,prepared:false,origin:'empty'};}
 try{const legacy=await access('dataset',null,false,'jianwei-local','workspace');if(legacy)return {dataset:legacy,prepared:false,origin:'migrated'};}catch{}
 remember('workspacePresent',false);return {dataset:null,prepared:false,origin:'empty'};
}
function containsKey(db,table,key){
 if(!db.objectStoreNames.contains(table)){db.close();return Promise.resolve(false);}
 return new Promise((resolve,reject)=>{let done=false,saved=false,tx;const timer=setTimeout(()=>{try{tx?.abort();}catch{}finish(new Error('本机材料检查超时'));},4500);function finish(error){if(done)return;done=true;clearTimeout(timer);db.close();error?reject(error):resolve(saved);}try{tx=db.transaction(table,'readonly');const req=tx.objectStore(table).getKey(key);req.onsuccess=()=>{saved=req.result!==undefined;};tx.oncomplete=()=>finish();tx.onerror=()=>finish(tx.error||new Error('本机材料暂时无法读取'));tx.onabort=()=>finish(tx.error||new Error('本机材料检查已取消'));}catch(error){finish(error);}});
}
export async function inspectWorkspace(){
 const saved=await containsKey(await open(),TABLE,'dataset');
 if(saved){remember('workspacePresent',true);return {stored:true,origin:'saved'};}
 if(STORAGE_SCOPE)return {stored:false,origin:'empty'};
 try{if(await containsKey(await open('jianwei-local'),'workspace','dataset'))return {stored:true,origin:'migrated'};}catch{}
 return {stored:false,origin:'empty'};
}
// A concurrent import wins; background migration cannot overwrite newer data.
export async function savePreparedIfCurrent(dataset,expectedStamp){
 const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(TABLE,'readwrite'),store=tx.objectStore(TABLE),r=store.get('prepared');let saved=false;
 r.onsuccess=()=>{if((r.result?.stamp??null)!==expectedStamp)return;store.put(dataset,'dataset');store.put({version:PREPARED_VERSION,stamp:crypto.randomUUID()},'prepared');saved=true;};
 tx.oncomplete=()=>{db.close();resolve(saved)};tx.onerror=()=>{db.close();reject(tx.error)};
 });
}
