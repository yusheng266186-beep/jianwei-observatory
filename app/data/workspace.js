import {normalizeDataset} from './compat.js?v=glass-20261011';
const DB='hengji-evidence-workspace',TABLE='materials';
const localPrefix='hengji:';
export function preference(key,fallback) { try {return JSON.parse(localStorage.getItem(localPrefix+key))??fallback;}catch{return fallback;} }
export function remember(key,value) {try{localStorage.setItem(localPrefix+key,JSON.stringify(value));}catch{}}
function open(name=DB) {
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(name,1);let done=false;
    const timer=setTimeout(()=>finish(new Error('本机存储暂时没有响应')),3500);
    const finish=(error,result)=>{if(done){result?.close();return;}done=true;clearTimeout(timer);error?reject(error):resolve(result);};
    req.onupgradeneeded=()=>{if(name===DB&&!req.result.objectStoreNames.contains(TABLE))req.result.createObjectStore(TABLE);};
    req.onsuccess=()=>finish(null,req.result);
    req.onerror=()=>finish(req.error);req.onblocked=()=>finish(new Error('本机数据被另一个页面占用'));
  });
}
async function access(key,value,write=false,name=DB,table=TABLE) {
  const db=await open(name);
  if(!db.objectStoreNames.contains(table)){db.close();return null;}
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(table,write?'readwrite':'readonly');let result=null,done=false;
    const timer=setTimeout(()=>finish(new Error('本机存储操作超时')),4500);
    const finish=error=>{if(done)return;done=true;clearTimeout(timer);db.close();error?reject(error):resolve(result);};
    const request=write?tx.objectStore(table).put(value,key):tx.objectStore(table).get(key);
    request.onsuccess=()=>{result=request.result??null;};tx.oncomplete=()=>finish();tx.onerror=()=>finish(tx.error);tx.onabort=()=>finish(tx.error);
  });
}
export const save=dataset=>access('dataset',dataset,true);
export const loadNotebook=()=>access('notebook');
export const saveNotebook=notebook=>access('notebook',notebook,true);
export async function sample() {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try {
    const response=await fetch(new URL('../../data/sample.json.gz',import.meta.url),{signal:controller.signal});
    if(!response.ok) throw new Error('成绩样本无法读取，你可以直接导入原表。');
    const blob=await response.blob(),head=new Uint8Array(await blob.slice(0,2).arrayBuffer());
    const raw=head[0]===31&&head[1]===139?new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))):new Response(blob);
    return normalizeDataset(await raw.json());
  } finally {clearTimeout(timer);}
}
export async function hydrate() {
  let current=null;try{current=await access('dataset');}catch{}
  if(current)return {dataset:normalizeDataset(current),origin:'saved'};
  try {
    const legacy=await access('dataset',null,false,'jianwei-local','workspace');
    if(legacy){await save(legacy);return {dataset:normalizeDataset(legacy),origin:'migrated'};}
  }catch{}
  return {dataset:await sample(),origin:'sample'};
}
export const preserveUndo=dataset=>access('previous',dataset,true);
export const previous=()=>access('previous');
export function emptyDataset(){return normalizeDataset({title:'衡迹工作区',school:'',grade:'',anonymous:false});}
