const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
 const $=s=>root.querySelector('[data-pelican-'+s+']'),storageKey='jianwei-pelican-comparison-v1';
 let candidates=[],activeId='',data=null,epoch=0,timer=0,loading=false,submitting=false;
 const active=()=>['running','queued'].includes(data?.status);
 const message=text=>{$('message').textContent=text;};
 function save(){try{localStorage.setItem(storageKey,JSON.stringify({candidates,activeId,prompt:$('prompt').value}));}catch{}}
 function restore(){try{const value=JSON.parse(localStorage.getItem(storageKey)||'null');if(value){candidates=Array.isArray(value.candidates)?value.candidates.filter(s=>typeof s?.provider==='string'&&typeof s.model==='string'&&typeof s.effort==='string').slice(0,8):[];activeId=/^[a-f0-9-]{36}$/.test(value.activeId||'')?value.activeId:'';$('prompt').value=typeof value.prompt==='string'?value.prompt.slice(0,6000):'';}}catch{}}
 function addSelection(){const selected=getSelection();if(!selected||active()||candidates.length>=8)return false;const s={provider:selected.provider,model:selected.model,effort:selected.effort};if(candidates.some(c=>c.provider===s.provider&&c.model===s.model&&c.effort===s.effort)){message('当前模型与档位已在比较列表中。');return false;}candidates.push(s);save();renderCandidates();message('已加入当前选择，可继续加入其他模型。');return true;}
 function renderCandidates(){const catalog=getCatalog();$('candidates').innerHTML=candidates.length?candidates.map((s,i)=>{const p=catalog.find(p=>p.id===s.provider),m=p?.models.find(m=>m.id===s.model);return '<span class="pelican-chip"><span><b>'+esc(m?.name||s.model)+'</b><small>'+esc(p?.label||s.provider)+' · '+esc(s.effort)+'</small></span><button type="button" data-pelican-remove="'+i+'" aria-label="移除 '+esc(m?.name||s.model)+'" '+(active()?'disabled':'')+'>×</button></span>';}).join(''):'<p class="pelican-empty">先加入一个或多个模型，再开始比较。</p>';$('add').disabled=active()||candidates.length>=8;$('run').disabled=active()||submitting||!candidates.length;$('cancel').hidden=!active();$('prompt').disabled=active();}
 function render(){const openSources=new Set(Array.from($('results').querySelectorAll('details[open]')).map(e=>e.dataset.source));renderCandidates();if(!data){$('results').innerHTML='';return;}$('results').innerHTML=data.candidates.map((r,i)=>{const p=getCatalog().find(p=>p.id===r.selection.provider),m=p?.models.find(m=>m.id===r.selection.model),src=pelicanImage(r.svg),usage=r.usage,number=value=>Number.isFinite(value)?value.toLocaleString():'—';return '<article class="pelican-result" aria-label="'+esc(r.label)+' 比较结果"><header><div><small>MODEL '+String(i+1).padStart(2,'0')+'</small><h3>'+esc(m?.name||r.label)+'</h3><p>'+esc(p?.label||r.selection.provider)+' · '+esc(r.selection.effort)+'</p></div><span class="pill">'+esc(states[r.status]||r.status)+'</span></header><div class="pelican-canvas'+(src?' has-image':'')+'">'+(src?'<img src="'+esc(src)+'" alt="'+esc(r.label)+' 绘制的骑车鹈鹕">':'<p>'+esc(r.status==='failed'?(errors[r.error]||'模型本次未完成，其他结果仍保留。'):r.status==='ready'?(r.renderWarning||'请查看模型原文。'):r.status==='cancelled'?'本项已停止':r.status==='running'?'正在等待模型响应…':'等待上一模型完成')+'</p>')+'</div><dl class="pelican-metrics"><div><dt>首段输出</dt><dd>'+pelicanTime(r.firstOutputMs)+'</dd></div><div><dt>'+ (r.status==='running'?'已等待':'总耗时')+'</dt><dd>'+pelicanTime(r.latencyMs??r.elapsedMs)+'</dd></div><div><dt>输入 / 输出 token</dt><dd>'+number(usage?.input)+' / '+number(usage?.output)+'</dd></div></dl>'+(src?'<a class="pelican-download" href="'+esc(src)+'" download="pelican-'+i+'.svg">下载 SVG ↗</a>':'')+(r.output?'<details class="pelican-source" data-source="'+i+'" '+(openSources.has(String(i))?'open':'')+'><summary>模型原文</summary><pre>'+esc(r.output)+'</pre></details>':'')+'</article>';}).join('');}
 function authError(e){if(['AUTH_REQUIRED','AUTH_EXPIRED','SESSION_CHANGED'].includes(e.code)){clearTimeout(timer);onAuthRequired();return true;}return false;}
 async function poll(){clearTimeout(timer);if(!activeId||!session()||document.hidden)return;const ticket=epoch,id=activeId;try{const next=await api('/admin/pelican/'+id);if(ticket!==epoch||activeId!==id)return;data=next;render();message(active()?'正在云端逐个比较，离开页面后仍会继续。':'本轮'+(states[data.status]||'已结束')+'，结果已保存在云端。');if(active())timer=setTimeout(poll,3000);}catch(e){if(ticket!==epoch||authError(e))return;if(e.code==='PELICAN_NOT_FOUND'){activeId='';data=null;save();render();message('云端未收到本轮比较，请重新开始。');return;}message('连接暂未恢复，云端比较仍保留；稍后自动重试。');timer=setTimeout(poll,6000);}}
 async function load(){if(!session()||loading)return;const ticket=epoch;loading=true;try{const result=await api('/admin/pelican');if(ticket!==epoch)return;$('history').innerHTML=result.runs?.length?result.runs.map(r=>'<button type="button" data-pelican-open="'+esc(r.id)+'"><span>'+esc(new Date(r.createdAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}))+' · '+r.candidates.length+' 个模型</span><small>'+esc(states[r.status]||r.status)+'</small></button>').join(''):'<p class="note">还没有已保存的比较。</p>';renderCandidates();if(activeId)await poll();}catch(e){if(ticket===epoch&&!authError(e))message(e.message||'暂时无法读取比较记录。');}finally{if(ticket===epoch)loading=false;}}
 root.addEventListener('click',async event=>{
  const target=event.target.closest('button');if(!target||!session())return;
  if(target.hasAttribute('data-pelican-add'))addSelection();
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
 restore();renderCandidates();
 return {load,addSelection,resume:poll,forget(){epoch++;loading=false;submitting=false;clearTimeout(timer);data=null;$('results').innerHTML='';$('history').innerHTML='';message('');}};
}
