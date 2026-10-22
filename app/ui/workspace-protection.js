import {access,preference,remember,workspaceStorage} from '../data/storage.js';
import {collectionCounts,protectionSummary,inspectBrowserStorage} from '../data/workspace-protection.js';
import {esc} from './html.js';
const bytes=n=>n==null?'':n>=1024**3?(n/1024**3).toFixed(1)+' GB':(n/1024**2).toFixed(1)+' MB';
export const workspaceProtectionHTML=()=>'<div class="workspace-protection" data-workspace-protection aria-label="备份与本机存储"><div role="status"><b>备份与本机存储</b><p>正在读取保存状态…</p></div></div>';
export function createWorkspaceProtection({snapshot,notify}){
 let serial=0,timer,requesting=false;
 async function refresh(){
  const root=document.querySelector('#stage [data-workspace-protection]');if(!root)return;const generation=++serial;
  const [journal,storage]=await Promise.allSettled([access('workspaceJournal'),inspectBrowserStorage()]);
  if(generation!==serial||!root.isConnected)return;
  const receipt=preference('workspaceBackupReceipt',null),counts=collectionCounts('dataset',snapshot()),known=journal.status==='fulfilled';
  const summary=protectionSummary({receipt,journal:known?journal.value:null,localRevision:preference('workspacePreferenceRevision',''),counts});
  const saved=receipt?.at?new Date(receipt.at).toLocaleString('zh-CN',{year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}):'';
  const state=storage.status==='fulfilled'?storage.value:{},storageLabel=state.persisted?'已启用存储保留':'由浏览器管理';
  root.innerHTML='<div class="workspace-backup-state" role="status"><span>完整备份</span><b>'+esc(known?summary.label:'保存状态暂未读到')+'</b>'+(saved?'<small>最近导出：'+esc(saved)+'</small>':'')+(!known?'<small>可先下载当前可恢复资料，再重试读取。</small>':summary.changes.length?'<small>较上次备份：'+esc(summary.changes.join(' · '))+'</small>':'')+'</div><div class="workspace-storage-state"><span>本机存储</span><b>'+storageLabel+'</b>'+(state.usage!=null&&state.quota?'<small>站点已用 '+bytes(state.usage)+' / 可用配额 '+bytes(state.quota)+'</small>':'')+(state.usage!=null&&state.quota&&state.usage/state.quota>.85?'<small class="storage-capacity-note">存储空间较紧，建议先下载备份，再整理导出缓存。</small>':'')+(state.supported&&!state.persisted?'<button type="button" class="button quiet" data-cmd="storage-protect" '+(requesting?'disabled':'')+'>'+(requesting?'正在申请…':'加强本机保存 ↗')+'</button>':'')+'</div><p class="workspace-protection-help">空间为浏览器站点估算值。换设备或清理浏览器前，请保留已下载的完整备份；存储保留不能代替备份。</p>';
 }
 const schedule=()=>{clearTimeout(timer);if(document.querySelector('#stage [data-workspace-protection]'))timer=setTimeout(()=>refresh().catch(()=>{}),250);};
 const prefix=workspaceStorage(location.pathname).prefix;
 window.addEventListener('workspace-saved',schedule);
 window.addEventListener('storage',e=>{if(e.key?.startsWith(prefix))schedule();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
 window.addEventListener('focus',schedule);
 return {mount:()=>refresh().catch(()=>{}),async protect(){if(requesting)return;requesting=true;try{const pending=navigator.storage?.persist?.();refresh().catch(()=>{});const granted=await pending;notify(granted?'已启用存储保留，仍建议定期下载完整备份。':'浏览器暂未开启存储保留，本机资料仍可正常保存；请定期下载完整备份。');}catch{notify('浏览器暂未完成存储设置，稍后可以重试。');}finally{requesting=false;await refresh();}},receipt(value){if(!remember('workspaceBackupReceipt',value))notify('备份已发起下载，最近备份时间未能记录。');schedule();}};
}
