import {access,workspaceStorage} from '../data/storage.js';
// Material versions are small. Do not reload grades, discard input, or treat
// unrelated plan/exercise writes as a new grade dataset while the user reads.
export function createWorkspaceUpdates({stamp,busy=()=>false,preserve,reload=()=>location.reload()}){
 const root=document.createElement('aside');root.className='workspace-update';root.hidden=true;root.setAttribute('role','status');
 root.innerHTML='<div><b>其他页面已更新材料</b><p data-workspace-update-message>本页仍显示原材料。先保留本页资料，再载入最新材料。</p></div><button type="button" class="button outline" data-cmd="workspace-load-latest">备份本页并载入</button>';
 document.querySelector('.masthead').after(root);
 const button=root.querySelector('button'),message=root.querySelector('p'),prefix=workspaceStorage(location.pathname).prefix;
 let started=false,loading=false,timer,request=0;
 async function check(){
  if(!started||loading||document.hidden)return;if(busy()){schedule();return;}
  const serial=++request,current=stamp();
  try{const meta=await access('prepared');if(serial!==request||loading||busy()||current!==stamp())return;root.hidden=!meta?.stamp||meta.stamp===current;}catch{/* Keep any existing reminder until the material version can be read. */}
 }
 const schedule=()=>{clearTimeout(timer);timer=setTimeout(check,80);};
 window.addEventListener('storage',event=>{if(event.key===prefix+'workspaceChangeHint')schedule();});
 window.addEventListener('workspace-saved',schedule);window.addEventListener('focus',schedule);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
 return {start(){started=true;check();},async load(){
  if(loading||busy())return;loading=true;request++;button.disabled=true;button.textContent='正在保留本页资料…';message.textContent='正在下载本页资料，草稿和未保存修改会一并保留。';
  const regions=[document.querySelector('.masthead'),document.getElementById('stage'),document.getElementById('navigation')].filter(Boolean).map(node=>({node,inert:node.inert}));for(const {node} of regions)node.inert=true;
  try{
   const result=await preserve();
   // An old material snapshot is expected here; other incomplete collections
   // must remain recoverable on this page rather than being lost to a reload.
   if(result.missing.some(key=>key!=='currentDataset'))throw new Error('已下载当前可恢复资料。部分内容尚未保存或读取完成，请保留本页，稍后再试。');
   button.textContent='正在载入最新材料…';await reload();
  }catch(error){message.textContent=error.message||'本页仍保留，请先备份后再载入最新材料。';}
  finally{for(const {node,inert} of regions)node.inert=inert;loading=false;button.disabled=false;button.textContent='备份本页并载入';}
 }};
}
