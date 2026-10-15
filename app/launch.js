(() => {
  const script=document.currentScript,base=new URL('./',script.src),stage=document.getElementById('stage'),files=document.getElementById('files');
  let ready=false,application,boot,pendingFiles=null;
  const source=import(new URL(script.dataset.storage||'./data/storage.js?v=runtime-v45',base));
  // A successful previous save is a hint only. The worker still reads the
  // authoritative dataset; an absent or cleared workspace restores the landing.
  const prefix=/^\/jianwei-observatory-preview(?:\/|$)/.test(location.pathname)?'hengji-gemini-preview:':'hengji:';
  let savedHint=false;try{savedHint=localStorage.getItem(prefix+'workspacePresent')==='true';}catch{}
  const materials=savedHint?Promise.resolve({stored:true,origin:'saved',preparation:prepare()}):source.then(storage=>storage.inspectWorkspace());
  function prepare(){return new Promise((resolve,reject)=>{const worker=new Worker(new URL(script.dataset.prepare||'./data/prepare-worker.js?v=runtime-v45',base),{type:'module'}),timer=setTimeout(()=>finish(new Error('材料恢复超时，请刷新后重试')),120000);function finish(error,value){clearTimeout(timer);worker.terminate();error?reject(error):resolve(value);}worker.onmessage=({data})=>finish(data.error?new Error(data.error):null,data.result);worker.onerror=()=>finish(new Error('材料恢复组件未能打开，请刷新后重试'));worker.postMessage({operation:'hydrate'});});}
  const readingDefaults={density:'comfortable',surface:'glass',motion:'system'};
  function applyReading(reading={}){for(const [key,fallback] of Object.entries(readingDefaults))document.body.dataset[key]=reading[key]||fallback;}
  applyReading();source.then(storage=>applyReading(storage.preference('reading',{}))).catch(()=>{});
  const stylesheet=(()=>{const link=document.querySelector('[data-workspace-styles]');if(!link||link.media==='all'||link.sheet){if(link)link.media='all';return Promise.resolve();}return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('页面样式加载超时，请重试')),30000);link.addEventListener('load',()=>{clearTimeout(timer);link.media='all';resolve();},{once:true});link.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('页面样式暂时无法载入'));},{once:true});});})();stylesheet.catch(()=>{});
  function start(){
    if(!application){application=Promise.all([import(new URL(script.dataset.runtime||'./main.js?v=runtime-v45',base)),materials,stylesheet]).then(async([module,value])=>{boot=value;await module.mount(boot);if(pendingFiles){const list=pendingFiles;pendingFiles=null;window.dispatchEvent(new CustomEvent('hengji:import-files',{detail:list}));}});application.catch(error=>{application=null;failure('启动组件未能载入：'+error.message);});}
    return application;
  }
  if(savedHint){const hint=stage.querySelector('.welcome-school small');if(hint)hint.textContent='正在恢复本机材料 · 可继续导入';start();}
  materials.then(value=>{
    if(value.stored){if(!value.preparation)value.preparation=prepare();value.preparation.catch(()=>{});const hint=stage.querySelector('.welcome-school small');if(hint)hint.textContent='正在恢复本机材料 · 可继续导入';start();return;}
    if(!stage.querySelector('#welcome-title'))stage.replaceChildren(document.getElementById('empty-workspace-template').content.cloneNode(true));stage.setAttribute('aria-busy','false');
    // The full app is deliberately absent until an action needs it.
    window.dispatchEvent(new Event('hengji:landing-ready'));
  }).catch(()=>start());
  function failure(message) {
    if(ready)return;
    stage.replaceChildren();const box=document.createElement('div');box.className='startup';
    const title=document.createElement('h1');title.textContent='研究台暂时没有打开';
    const detail=document.createElement('p');detail.textContent=message;
    const action=document.createElement('button');action.className='button accent';action.dataset.cmd='import';action.textContent='先导入原始成绩表';
    const reload=document.createElement('button');reload.className='button outline';reload.textContent='重新打开';reload.onclick=()=>location.reload();
    box.append(title,detail,action,reload);stage.append(box);
  }
  document.addEventListener('click',event=>{
    if(ready)return;const action=event.target.closest('[data-cmd]');if(!action)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(action.dataset.cmd==='import'){files.click();start();}
    else {const data={...action.dataset};start().then(()=>[...document.querySelectorAll('[data-cmd]')].find(node=>Object.entries(data).every(([key,value])=>node.dataset[key]===value))?.click());}
  },true);
  files.addEventListener('change',async()=>{
    if(ready||!files.files.length)return;
    pendingFiles=[...files.files];start();
  });
  document.addEventListener('dragover',event=>{if(!ready&&event.target.closest('#drop-zone')){event.preventDefault();event.target.closest('#drop-zone').classList.add('dragover');}});
  document.addEventListener('drop',event=>{if(!ready&&event.target.closest('#drop-zone')){event.preventDefault();event.stopImmediatePropagation();pendingFiles=[...event.dataTransfer.files];start();}},true);
  const timer=setTimeout(()=>{if(stage.getAttribute('aria-busy')==='true')failure('研究台暂时未能打开，请重试或导入成绩材料。');},15000);
  window.addEventListener('hengji:ready',()=>{ready=true;clearTimeout(timer);},{once:true});
})();
