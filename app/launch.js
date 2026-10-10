(() => {
  const script=document.currentScript,base=new URL('./',script.src),stage=document.getElementById('stage'),files=document.getElementById('files');
  let ready=false;
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
    if(!ready&&event.target.closest('[data-cmd="import"]')){event.preventDefault();event.stopImmediatePropagation();files.click();}
  },true);
  files.addEventListener('change',async()=>{
    if(ready||!files.files.length)return;
    try {
      const file=files.files[0],worker=new Worker(new URL('./data/worker.js',base));
      const dataset=await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{worker.terminate();reject(new Error('材料读取超时，请重新打开页面后再导入。'));},180000);
        worker.onmessage=({data})=>{if(data.type==='ready'){clearTimeout(timer);worker.terminate();resolve(data.dataset);}if(data.type==='error'||data.type==='mapping'){clearTimeout(timer);worker.terminate();reject(new Error(data.message||'恢复入口支持标准成绩工作簿和 JSON 备份，请重新打开后对应其他表格的列。'));}};
        worker.onerror=()=>{clearTimeout(timer);worker.terminate();reject(new Error('读取组件无法载入，请刷新页面。'));};
        file.arrayBuffer().then(buffer=>worker.postMessage({name:file.name,buffer})).catch(reject);
      });
      const workspace=await import(new URL('./data/workspace.js',base));await workspace.save(dataset);location.reload();
    }catch(error){failure(error.message);}
  });
  const timer=setTimeout(()=>failure('启动等待已结束。你可以重试或先导入标准成绩工作簿。'),15000);
  window.addEventListener('hengji:ready',()=>{ready=true;clearTimeout(timer);},{once:true});
  import(new URL('./main.js',base)).then(module=>module.mount()).catch(error=>{clearTimeout(timer);failure('启动组件未能载入：'+error.message);});
})();
