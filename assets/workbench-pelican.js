import {PELICAN_DEFAULT_PROMPT,PELICAN_PROMPT_VERSION} from './pelican-prompt.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const legacyPrompt='绘制一只骑自行车的鹈鹕。用完整、自包含的 SVG 表现清晰的鸟喙、身体、双轮、车架与脚踏关系，构图协调。直接输出 SVG，不引用外部资源，不使用脚本、foreignObject 或动画。';
const states={queued:'等待比较',running:'正在绘制',ready:'已完成',partial:'部分完成',failed:'未完成',cancelled:'已停止'};
const errors={MODEL_AUTH_FAILED:'账号需要重新授权。',MODEL_RATE_LIMIT:'当前账号繁忙，请稍后再比较。',NETWORK_TIMEOUT:'本次模型响应超时。',MODEL_NOT_CONFIGURED:'所选服务尚未配置。',CODEX_ACCOUNT_REAUTH_REQUIRED:'当前官方账号需要重新授权。',REQUEST_ID_CONFLICT:'本次请求与已保存的比较不同，请重新开始。'};
export const pelicanTime=value=>Number.isFinite(value)?(value/1000).toFixed(1)+' 秒':'—';
export function pelicanImage(svg){
 if(typeof svg==='string')svg=svg.replace(/<!--[\s\S]*?-->/g,'');
 if(typeof svg!=='string'||!/^<svg\b/i.test(svg)||svg.length>200000||/<(?:script|foreignObject|iframe|image|animate|set|a)\b|\bon\w+\s*=|<!|<\?|@import/i.test(svg))return '';
 for(const m of svg.matchAll(/\b(?:href|src)\s*=\s*["']([^"']*)["']/gi))if(!/^#[A-Za-z0-9_.:-]+$/.test(m[1]))return '';
 for(const m of svg.matchAll(/url\s*\(\s*["']?([^\s"')]+)["']?\s*\)/gi))if(!/^#[A-Za-z0-9_.:-]+$/.test(m[1]))return '';
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
export function createPelicanPanel({root,api,session,getSelection,getCatalog,onAuthRequired=()=>{}}){
 const previews=new Map(),downloads=new Map(),readyCards=new Map();
 const $=s=>root.querySelector('[data-pelican-'+s+']'),storageKey='jianwei-pelican-comparison-v2';
 let candidates=[],activeId='',data=null,renderedId='',epoch=0,timer=0,loading=false,submitting=false;
 const active=()=>['running','queued'].includes(data?.status);
 const message=text=>{$('message').textContent=text;};
 function save(){try{localStorage.setItem(storageKey,JSON.stringify({candidates,activeId,prompt:$('prompt').value}));}catch{}}
 function restore(){try{const value=JSON.parse(localStorage.getItem(storageKey)||localStorage.getItem('jianwei-pelican-comparison-v1')||'null');if(value){candidates=Array.isArray(value.candidates)?value.candidates.filter(s=>typeof s?.provider==='string'&&typeof s.model==='string'&&typeof s.effort==='string').slice(0,8):[];activeId=/^[a-f0-9-]{36}$/.test(value.activeId||'')?value.activeId:'';$('prompt').value=typeof value.prompt==='string'&&value.prompt!==legacyPrompt?value.prompt.slice(0,6000):PELICAN_DEFAULT_PROMPT;}}catch{}}
 function addSelection(){const selected=getSelection();if(!selected||active()||candidates.length>=8)return false;const s={provider:selected.provider,model:selected.model,effort:selected.effort};if(candidates.some(c=>c.provider===s.provider&&c.model===s.model&&c.effort===s.effort)){message('当前模型与档位已在比较列表中。');return false;}candidates.push(s);save();renderCandidates();message('已加入当前选择，可继续加入其他模型。');return true;}
 function renderCandidates(){const catalog=getCatalog();$('candidates').innerHTML=candidates.length?candidates.map((s,i)=>{const p=catalog.find(p=>p.id===s.provider),m=p?.models.find(m=>m.id===s.model);return '<span class="pelican-chip"><span><b>'+esc(m?.name||s.model)+'</b><small>'+esc(p?.label||s.provider)+' · '+esc(s.effort)+'</small></span><button type="button" data-pelican-remove="'+i+'" aria-label="移除 '+esc(m?.name||s.model)+'" '+(active()?'disabled':'')+'>×</button></span>';}).join(''):'<p class="pelican-empty">先加入一个或多个模型，再开始比较。</p>';$('add').disabled=active()||candidates.length>=8;$('run').disabled=active()||submitting||!candidates.length;$('cancel').hidden=!active();$('prompt').disabled=active();$('reset-prompt').disabled=active();}
 function viewer(html,title){const id=crypto.randomUUID(),node=document.createElement('iframe');node.src='./pelican-preview.html?v=html-v1#'+id;node.title=title;node.sandbox='allow-scripts';node.referrerPolicy='no-referrer';node.dataset.pelicanFrame=id;previews.set(id,{node,html});return node;}
 addEventListener('message',event=>{if(event.data?.type!=='jianwei-pelican-viewer-ready')return;const entry=previews.get(event.data.id);if(entry&&event.source===entry.node.contentWindow)entry.node.contentWindow.postMessage({type:'jianwei-pelican-render',id:event.data.id,html:entry.html},'*');});
 const dialog=document.createElement('dialog');dialog.className='pelican-preview-dialog';dialog.innerHTML='<header><h2>HTML 动画预览</h2><button type="button" aria-label="关闭动画预览">×</button></header><div class="pelican-preview-body"></div>';document.body.append(dialog);
 const closePreview=()=>{for(const [id,value] of previews)if(dialog.contains(value.node))previews.delete(id);dialog.querySelector('.pelican-preview-body').replaceChildren();dialog.close();};dialog.querySelector('button').addEventListener('click',closePreview);dialog.addEventListener('cancel',event=>{event.preventDefault();closePreview();});
 function render(){
  const openSources=new Set(Array.from($('results').querySelectorAll('details[open]')).map(e=>e.dataset.source));renderCandidates();
  if(!data){$('results').replaceChildren();return;}
  const results=$('results');
  if(renderedId!==data.id){readyCards.clear();for(const url of downloads.values())URL.revokeObjectURL(url);downloads.clear();results.replaceChildren();renderedId=data.id;}
  const place=(node,index)=>{const existing=results.children[index];if(existing!==node){if(existing)existing.replaceWith(node);else results.append(node);}};
  for(const [i,r] of data.candidates.entries()){
   const saved=readyCards.get(r.id);if(saved&&r.status==='ready'){place(saved,i);continue;}
   const p=getCatalog().find(p=>p.id===r.selection.provider),m=p?.models.find(m=>m.id===r.selection.model),html=r.html||r.svg||'',kind=r.kind||(r.html?'html':'svg'),usage=r.usage,number=v=>Number.isFinite(v)?v.toLocaleString():'—',article=document.createElement('article');article.className='pelican-result';article.setAttribute('aria-label',r.label+' 比较结果');
   article.innerHTML='<header><div><small>MODEL '+String(i+1).padStart(2,'0')+'</small><h3>'+esc(m?.name||r.label)+'</h3><p>'+esc(p?.label||r.selection.provider)+' · '+esc(r.selection.effort)+'</p></div><span class="pill">'+esc(states[r.status]||r.status)+'</span></header><div class="pelican-canvas'+(html?' has-document':'')+'">'+(html?'':'<p>'+esc(r.status==='failed'?(errors[r.error]||'模型本次未完成，其他结果仍保留。'):r.status==='ready'?(r.renderWarning||'请查看模型原文。'):r.status==='cancelled'?'本项已停止':r.status==='running'?'正在生成HTML动画…':'等待上一模型完成')+'</p>')+'</div><dl class="pelican-metrics"><div><dt>首段输出</dt><dd>'+pelicanTime(r.firstOutputMs)+'</dd></div><div><dt>'+(r.status==='running'?'已等待':'总耗时')+'</dt><dd>'+pelicanTime(r.latencyMs??r.elapsedMs)+'</dd></div><div><dt>输入 / 输出 token</dt><dd>'+number(usage?.input)+' / '+number(usage?.output)+'</dd></div></dl>'+(html?'<div class="pelican-document-actions"><button type="button" data-pelican-preview="'+i+'">放大预览 ↗</button><a class="pelican-download" download="pelican-'+i+'.'+(kind==='svg'?'svg':'html')+'">下载'+(kind==='svg'?' SVG':' HTML')+' ↗</a></div>':'')+(r.output?'<details class="pelican-source" data-source="'+i+'" '+(openSources.has(String(i))?'open':'')+'><summary>模型原文</summary><pre>'+esc(r.output)+'</pre></details>':'');
   if(html){article.querySelector('.pelican-canvas').append(viewer(html,(m?.name||r.label)+' · HTML动画'));let url=downloads.get(r.id);if(!url){url=URL.createObjectURL(new Blob([html],{type:kind==='svg'?'image/svg+xml':'text/html'}));downloads.set(r.id,url);}article.querySelector('a.pelican-download').href=url;}
   if(r.status==='ready')readyCards.set(r.id,article);place(article,i);
  }
  while(results.children.length>data.candidates.length)results.lastElementChild.remove();
  for(const [id,entry] of previews)if(!entry.node.isConnected)previews.delete(id);
 }

 function authError(e){if(['AUTH_REQUIRED','AUTH_EXPIRED','SESSION_CHANGED'].includes(e.code)){clearTimeout(timer);onAuthRequired();return true;}return false;}
 async function poll(){clearTimeout(timer);if(!activeId||!session()||document.hidden)return;const ticket=epoch,id=activeId;try{const next=await api('/admin/pelican/'+id);if(ticket!==epoch||activeId!==id)return;data=next;render();message(active()?'正在云端逐个比较，离开页面后仍会继续。':'本轮'+(states[data.status]||'已结束')+'，结果已保存在云端。');if(active())timer=setTimeout(poll,3000);}catch(e){if(ticket!==epoch||authError(e))return;if(e.code==='PELICAN_NOT_FOUND'){activeId='';data=null;save();render();message('云端未收到本轮比较，请重新开始。');return;}message('连接暂未恢复，云端比较仍保留；稍后自动重试。');timer=setTimeout(poll,6000);}}
 async function load(){if(!session()||loading)return;const ticket=epoch;loading=true;try{const result=await api('/admin/pelican');if(ticket!==epoch)return;$('history').innerHTML=result.runs?.length?result.runs.map(r=>'<button type="button" data-pelican-open="'+esc(r.id)+'"><span>'+esc(new Date(r.createdAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}))+' · '+r.candidates.length+' 个模型</span><small>'+esc(states[r.status]||r.status)+'</small></button>').join(''):'<p class="note">还没有已保存的比较。</p>';renderCandidates();if(activeId)await poll();}catch(e){if(ticket===epoch&&!authError(e))message(e.message||'暂时无法读取比较记录。');}finally{if(ticket===epoch)loading=false;}}
 root.addEventListener('click',async event=>{
  const target=event.target.closest('button');if(!target||!session())return;
  if(target.hasAttribute('data-pelican-preview')){const item=data?.candidates[Number(target.dataset.pelicanPreview)];if(item?.html||item?.svg){dialog.querySelector('.pelican-preview-body').replaceChildren(viewer(item.html||item.svg,item.label+' · 完整HTML动画'));dialog.showModal();}}
  if(target.hasAttribute('data-pelican-add'))addSelection();
  if(target.hasAttribute('data-pelican-reset-prompt')&&!active()){$('prompt').value=PELICAN_DEFAULT_PROMPT;save();message('已恢复 Cockpit Tools 1.3.73 原始提示词。');}
  if(target.hasAttribute('data-pelican-remove')&&!active()){candidates.splice(Number(target.dataset.pelicanRemove),1);save();renderCandidates();}
  if(target.hasAttribute('data-pelican-refresh'))await load();
  if(target.hasAttribute('data-pelican-open')){activeId=target.dataset.pelicanOpen;save();await poll();}
  if(target.hasAttribute('data-pelican-run')&&!submitting&&!active()){
   const ticket=epoch;submitting=true;activeId=crypto.randomUUID();data={id:activeId,status:'queued',candidates:candidates.map(s=>({label:s.model,selection:s,status:'queued'}))};save();renderCandidates();message('正在提交本轮比较…');
   try{data=await api('/admin/pelican',{method:'POST',id:activeId,body:{candidates,...($('prompt').value.trim()?{prompt:$('prompt').value.trim()}:{} )}});if(ticket!==epoch)return;render();await poll();}
   catch(e){if(ticket!==epoch||authError(e))return;if(e.status&&e.status<500){activeId='';data=null;save();message(errors[e.code]||e.message);}else{message('提交结果暂未确认，正在查询云端；无需重复开始。');timer=setTimeout(poll,3000);}}
   finally{if(ticket===epoch){submitting=false;renderCandidates();}}
  }
  if(target.hasAttribute('data-pelican-cancel')){const ticket=epoch;target.disabled=true;try{const next=await api('/admin/pelican/'+activeId+'/cancel',{method:'POST',body:{}});if(ticket!==epoch)return;data=next;clearTimeout(timer);render();message('已停止本轮；已完成的模型结果仍保留。');}catch(e){if(ticket===epoch&&!authError(e))message(e.message);}finally{if(ticket===epoch)target.disabled=false;}}
 });
 $('prompt').addEventListener('input',save);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else if(session()&&activeId)poll();});
 restore();if(!$('prompt').value)$('prompt').value=PELICAN_DEFAULT_PROMPT;$('prompt').dataset.version=PELICAN_PROMPT_VERSION;renderCandidates();
 return {load,addSelection,resume:poll,forget(){epoch++;readyCards.clear();for(const url of downloads.values())URL.revokeObjectURL(url);downloads.clear();previews.clear();closePreview();loading=false;submitting=false;clearTimeout(timer);data=null;$('results').innerHTML='';$('history').innerHTML='';message('');}};
}
