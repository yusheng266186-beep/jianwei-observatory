import {normalizeDataset} from './compat.js?v=optics-v28';
import {SITE_NAME} from '../brand.js?v=optics-v28';
const DB='hengji-evidence-workspace',TABLE='materials';
const localPrefix='hengji:';
export function preference(key,fallback) { try {return JSON.parse(localStorage.getItem(localPrefix+key))??fallback;}catch{return fallback;} }
export function remember(key,value) {try{localStorage.setItem(localPrefix+key,JSON.stringify(value));return true;}catch{return false;}}
function open(name=DB) {
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(name,1);let done=false;
    const timer=setTimeout(()=>finish(new Error('本机存储暂时没有响应')),3500);
    const finish=(error,result)=>{if(done){result?.close();return;}done=true;clearTimeout(timer);error?reject(error):resolve(result);};
    req.onupgradeneeded=()=>{if(name===DB&&!req.result.objectStoreNames.contains(TABLE))req.result.createObjectStore(TABLE);};
    req.onsuccess=()=>finish(null,req.result);
    req.onerror=()=>finish(req.error||new Error('无法打开本机存储'));req.onblocked=()=>finish(new Error('本机数据被另一个页面占用'));
  });
}
async function access(key,value,write=false,name=DB,table=TABLE,entries=null) {
  const db=await open(name);
  if(!db.objectStoreNames.contains(table)){db.close();return null;}
  return new Promise((resolve,reject)=>{
    let tx,result=null,done=false;
    const timer=setTimeout(()=>{try{tx?.abort();}catch{}finish(new Error('本机存储操作超时，内容未保存'));},4500);
    const finish=error=>{if(done)return;done=true;clearTimeout(timer);db.close();error?reject(error):resolve(result);};
    try {
      tx=db.transaction(table,write?'readwrite':'readonly');
      tx.oncomplete=()=>finish();tx.onerror=()=>finish(tx.error||new Error('本机存储写入失败'));tx.onabort=()=>finish(tx.error||new Error('本机存储事务已取消，内容未保存'));
      if(write)for(const [entryKey,entryValue] of entries||[[key,value]])tx.objectStore(table).put(entryValue,entryKey);
      else{const request=tx.objectStore(table).get(key);request.onsuccess=()=>{result=request.result??null;};}
    }catch(error){try{tx?.abort();}catch{}finish(error);}
  });
}
// Capture values before awaiting the database; serialize writes in invocation order.
let writes=Promise.resolve();
function write(entries) {
  const snapshot=structuredClone(entries),operation=writes.then(()=>access(null,null,true,DB,TABLE,snapshot));
  writes=operation.catch(()=>{});return operation;
}
export const save=dataset=>write([['dataset',dataset]]);
export const loadNotebook=()=>access('notebook');
export const saveNotebook=notebook=>write([['notebook',notebook]]);
export const saveWorkspace=(dataset,prior,notebook)=>write([['previous',prior],['dataset',dataset],['notebook',notebook]]);
export function restoreDataset(dataset) {
  return dataset.anonymous===true&&dataset.userImported!==true?emptyDataset():normalizeDataset(dataset);
}
export function hasMaterials(dataset) {
  return Boolean(dataset.scores.length||dataset.answers.length||dataset.lines.length||Object.keys(dataset.banks).length);
}
export async function hydrate() {
  let current=null;try{current=await access('dataset');}catch{}
  if(current)return {dataset:restoreDataset(current),origin:'saved'};
  try {
    const legacy=await access('dataset',null,false,'jianwei-local','workspace');
    if(legacy){const dataset=restoreDataset(legacy);await save(dataset);return {dataset,origin:hasMaterials(dataset)?'migrated':'empty'};}
  }catch{}
  return {dataset:emptyDataset(),origin:'empty'};
}
export const preserveUndo=dataset=>write([['previous',dataset]]);
export const previous=()=>access('previous');
export function emptyDataset(){return normalizeDataset({title:SITE_NAME+'工作区',school:'',grade:'',anonymous:false});}
