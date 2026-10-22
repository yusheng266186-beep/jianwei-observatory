const scripts=new Map();
// Each output loads only its own dependency. A failed Excel request must not
// prevent Word exports, and an unsuccessful request remains retryable.
export function loadOutputVendor(file,global,{host=window,document:doc=document,timeout=15000}={}){
 if(host[global])return Promise.resolve(host[global]);
 const key=file+'|'+global;if(scripts.has(key))return scripts.get(key);
 const task=new Promise((resolve,reject)=>{
  const script=doc.createElement('script');let done=false;
  const timer=setTimeout(()=>finish(new Error('导出组件载入超时，请重试')),timeout);
  function finish(error){if(done)return;done=true;clearTimeout(timer);script.onload=null;script.onerror=null;if(error){script.remove();reject(error);}else resolve(host[global]);}
  script.src=new URL('../../vendor/'+file,import.meta.url).href;
  script.onload=()=>finish(host[global]?null:new Error('导出组件未能初始化，请重试'));
  script.onerror=()=>finish(new Error('导出组件暂时无法载入，请重试'));doc.head.append(script);
 });
 scripts.set(key,task);task.catch(()=>{if(scripts.get(key)===task)scripts.delete(key);});return task;
}
export const workbookVendor=()=>loadOutputVendor('xlsx.full.min.js','XLSX');
export const zipVendor=()=>loadOutputVendor('jszip.min.js','JSZip');
