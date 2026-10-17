(() => {
 const script=document.currentScript,base=new URL('./',script.src),stage=document.getElementById('stage'),files=document.getElementById('files');
 let ready=false,application,pendingFiles=null,importReader=null,themeTask;
 const source=import(new URL(script.dataset.storage||'./data/storage.js',base));
 const prefix=/^\/jianwei-observatory-preview(?:\/|$)/.test(location.pathname)?'hengji-gemini-preview:':'hengji:';
 let savedHint=false;try{savedHint=localStorage.getItem(prefix+'workspacePresent')==='true';}catch{}
 const materials=savedHint?Promise.resolve({stored:true,origin:'saved',preparation:prepare()}):source.then(storage=>storage.inspectWorkspace());
 function prepare(){return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL(script.dataset.prepare||'./data/prepare-worker.js',base),{type:'module'}),timer=setTimeout(()=>finish(new Error('材料恢复超时，请刷新后重试')),120000);
  function finish(error,value){clearTimeout(timer);worker.terminate();error?reject(error):resolve(value);}
  worker.onmessage=({data})=>finish(data.error?new Error(data.error):null,data.result);worker.onerror=()=>finish(new Error('材料恢复组件未能打开，请刷新后重试'));worker.postMessage({operation:'hydrate'});
 });}
 const defaults={density:'comfortable',surface:'glass',motion:'system'};
 function applyReading(reading={}){for(const [key,fallback] of Object.entries(defaults))document.body.dataset[key]=reading[key]||fallback;}
 applyReading();source.then(storage=>applyReading(storage.preference('reading',{}))).catch(()=>{});
 function status(message,{error=false}={}){
  const box=stage.querySelector('#launch-progress');if(!box)return;box.hidden=false;box.dataset.state=error?'error':'loading';box.querySelector('span').textContent=message;
  const retry=box.querySelector('button');retry.hidden=!error;retry.onclick=()=>location.reload();
 }
 function theme(){
  if(themeTask)return themeTask;const link=document.querySelector('[data-workspace-styles]');if(!link)return Promise.resolve();
  // An already-open/cached landing may still carry the previous href-based
  // stylesheet. Reuse it instead of assigning a missing data-href as a URL.
  if(link.sheet){link.media='all';return Promise.resolve();}
  themeTask=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>finish(new Error('页面样式加载超时，请重试')),90000);
   const loaded=()=>finish(),failed=()=>finish(new Error('页面样式暂时无法载入'));
   function finish(error){clearTimeout(timer);link.removeEventListener('load',loaded);link.removeEventListener('error',failed);if(error){themeTask=null;link.removeAttribute('href');reject(error);}else{link.media='all';resolve();}}
   link.addEventListener('load',loaded,{once:true});link.addEventListener('error',failed,{once:true});link.href=link.dataset.href||link.getAttribute('href');
  });return themeTask;
 }
 function warmImporter(spreadsheet=false){
  if(!script.dataset.importer)return;
  try{if(!importReader){importReader=new Worker(new URL(script.dataset.importer,base));importReader.onerror=()=>{importReader?.terminate();importReader=null;};}if(spreadsheet)importReader.postMessage({operation:'warm'});}catch{importReader=null;}
 }
 function start(){
  if(!application){
   // Fetch static dependencies in parallel, instead of discovering one module
   // after another on a high-latency connection. Nothing loads on an empty visit.
   for(const path of JSON.parse(script.dataset.preload||'[]')){const link=document.createElement('link');link.rel='modulepreload';link.href=new URL(path,base);document.head.append(link);}
   const notice=setTimeout(()=>{if(!ready)status('网络较慢，正在继续准备研究台。你的材料仍保留在本机。');},8000);
   application=Promise.all([import(new URL(script.dataset.runtime||'./main.js',base)),materials,theme()]).then(async([module,value])=>{
    await module.mount({...value,importReader});importReader=null;
    if(pendingFiles){const list=pendingFiles;pendingFiles=null;window.dispatchEvent(new CustomEvent('hengji:import-files',{detail:list}));}
   }).finally(()=>clearTimeout(notice));
   application.catch(error=>{application=null;status('研究台暂时未能打开：'+error.message,{error:true});});
  }return application;
 }
 function restoring(){const hint=stage.querySelector('.welcome-school small');if(hint)hint.textContent='正在恢复本机材料 · 可继续导入';status('正在恢复本机工作区，首页已可使用。');start();}
 if(savedHint)restoring();
 materials.then(value=>{
  if(value.stored){if(!value.preparation)value.preparation=prepare();value.preparation.catch(()=>{});if(!savedHint)restoring();return;}
  stage.setAttribute('aria-busy','false');window.dispatchEvent(new Event('hengji:landing-ready'));
 }).catch(()=>start());
 document.addEventListener('click',event=>{
  if(ready)return;const action=event.target.closest('[data-cmd]');if(!action)return;event.preventDefault();event.stopImmediatePropagation();
  if(action.dataset.cmd==='import'){files.click();warmImporter();status('请选择成绩工作簿，材料将在本机读取。');start();}
  else{const data={...action.dataset};status('正在准备'+(action.dataset.cmd==='template'?'录入模板':'工作区')+'…');start().then(()=>[...document.querySelectorAll('[data-cmd]')].find(node=>Object.entries(data).every(([key,value])=>node.dataset[key]===value))?.click()).catch(()=>{});}
 },true);
 files.addEventListener('change',()=>{if(ready||!files.files.length)return;pendingFiles=[...files.files];warmImporter(pendingFiles.some(file=>!/\.json$/i.test(file.name)));status('已选择 '+pendingFiles.map(file=>file.name).join('、')+'，正在准备本机读取…');start();});
 document.addEventListener('dragover',event=>{if(!ready&&event.target.closest('#drop-zone')){event.preventDefault();event.target.closest('#drop-zone').classList.add('dragover');}});
 document.addEventListener('drop',event=>{if(!ready&&event.target.closest('#drop-zone')){event.preventDefault();event.stopImmediatePropagation();pendingFiles=[...event.dataTransfer.files];warmImporter(pendingFiles.some(file=>!/\.json$/i.test(file.name)));status('已收到材料，正在准备本机读取…');start();}},true);
 window.addEventListener('hengji:ready',()=>{ready=true;},{once:true});
})();
