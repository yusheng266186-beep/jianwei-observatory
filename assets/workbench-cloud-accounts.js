// Cloud OpenAI OAuth accounts. The browser never receives an OAuth token, and
// the only value persisted here is the authorization attempt id, so a reload
// can resume polling without keeping a device code or credential.
import {esc} from '../app/ui/html.js';

export const CLOUD_AUTH_STORAGE='jianwei-cloud-auth-attempt';
export const CLOUD_DEVICE_URL='https://auth.openai.com/codex/device';

const FLOW_TERMINAL=new Set(['complete','failed','cancelled','expired']);
const FLOW_BUSY=new Set(['starting','queued','waiting']);
const knownErrors={
 AUTH_REQUIRED:'教师验证已过期，请重新输入动态验证码；已保存的云端账号和本次授权进度会保留。',
 AUTH_EXPIRED:'教师验证已过期，请重新输入动态验证码；已保存的云端账号和本次授权进度会保留。',
 CODEX_ACCOUNTS_DISABLED:'云端官方授权未启用，当前不能添加或切换官方账号。',
 CODEX_NOT_ENABLED:'云端官方授权未启用，当前不能添加、切换或唤醒官方账号。',
 CODEX_REVISION_CONFLICT:'云端状态已变化，请刷新后重试；当前账号未改变。',
 CODEX_ACCOUNT_BUSY:'该账号正在执行其他真实请求，请稍后再试。',
 CODEX_INPUT_INVALID:'本次账号操作参数未通过验证，请刷新后重试。',
 CODEX_OPERATION_NOT_FOUND:'本次云端操作已失效，请刷新账号后重试。',
 CODEX_OPERATION_EXPIRED:'本次云端操作已超时，请稍后重试。',
 CODEX_ACCOUNT_IDENTITY_INVALID:'官方返回的账号信息未通过验证，当前账号未改变。',
 CODEX_ACCOUNT_IDENTITY_MISMATCH:'登录的账号与所选账号不一致，当前账号未改变。',
 CODEX_AUTHORIZATION_NOT_FOUND:'本次授权已失效，请重新开始；当前账号未改变。',
 CODEX_AUTHORIZATION_EXPIRED:'本次授权已过期，请重新开始；当前账号未改变。',
 CODEX_AUTHORIZATION_CANCELLED:'本次授权已取消，当前账号未改变。',
 CODEX_AUTHORIZATION_CONFLICT:'云端状态已变化，请刷新后重试；当前账号未改变。',
 CODEX_ACCOUNT_NOT_FOUND:'这个账号已不在云端名单中，当前账号未改变。',
 CODEX_ACCOUNT_REAUTH_REQUIRED:'这个账号需要重新授权后才能继续使用。',
 CODEX_AUTHORIZATION_IN_PROGRESS:'官方授权正在完成验证，请稍候，结果会自动更新。',
 CODEX_RUNTIME_UNAVAILABLE:'云端官方连接暂时不可用，请稍后再试。',
 CODEX_AUTH_PERSIST_FAILED:'本次登录状态未能保存，请重新授权；已有出题配置保留。',
 CODEX_OPERATION_FAILED:'云端未完成本次账号操作，当前账号未改变。',
 MODEL_INCOMPLETE:'官方返回内容未通过唤醒校验，请稍后重试。',
 MODEL_AUTH_FAILED:'官方账号凭据未通过验证，请重新授权。',
 MODEL_RATE_LIMIT:'官方服务当前繁忙，请稍后重试。',
 MODEL_UPSTREAM_TIMEOUT:'官方服务等待超时，请稍后重试。',
 MODEL_REQUEST_FAILED:'官方服务未完成本次请求，请稍后重试。'
};

const numeric=value=>{
 if(value===null||value===undefined||value==='')return null;
 const number=Number(value);
 return Number.isFinite(number)?number:null;
};
const percentText=value=>Number.isFinite(value)?String(Math.round(value*10)/10).replace(/\.0$/,'')+'%':'未返回';
const minuteText=value=>!Number.isFinite(value)?'未返回':value>=1440&&value%1440===0?value/1440+' 天':value>=60&&value%60===0?value/60+' 小时':Math.round(value*10)/10+' 分钟';

// Only the exact official device page is allowed. No other host, protocol,
// port, credentials, query string or fragment may reach an anchor href.
export function verificationUrl(value){
 const raw=String(value??'');
 if(raw!==raw.trim()||raw.includes('?')||raw.includes('#'))return '';
 try{
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.hostname!=='auth.openai.com'||url.port)return '';
  if(url.username||url.password)return '';
  if(url.pathname!=='/codex/device'||url.search||url.hash)return '';
  return url.href;
 }catch{return '';}
}

export function cloudTime(value){
 if(value===null||value===undefined||value==='')return '';
 let time;
 if(typeof value==='number')time=value;
 else if(/^\d+$/.test(String(value).trim()))time=Number(value);
 else time=Date.parse(String(value));
 if(!Number.isFinite(time)||time<=0)return '';
 if(time<1e11)time*=1000;
 try{
  return new Date(time).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
 }catch{return '';}
}

function quotaRow(label,bucket,limitId=''){
 const used=numeric(bucket?.usedPercent??bucket?.used_percent);
 const minutes=numeric(bucket?.windowMinutes??bucket?.windowMins??bucket?.window_minutes??bucket?.window_mins??bucket?.windowDurationMins);
 const resets=numeric(bucket?.resetsAt??bucket?.resets_at);
 const remaining=used===null?null:Math.min(100,Math.max(0,Math.round((100-used)*10)/10));
 return {
  key:(limitId?limitId+'/':'')+label,
  label,
  limitId,
  usedPercent:used,
  usedText:percentText(used),
  remaining,
  remainingText:percentText(remaining),
  windowMinutes:minutes,
  windowText:minuteText(minutes),
  resetsAt:resets,
  resetsText:resets===null?'未返回':(cloudTime(resets)||'未返回')
 };
}

// Returns the official primary/secondary buckets without estimating usage or
// converting a percentage into a number of generations. Missing fields remain
// null and render as 未返回.
export function quotaRows(quota){
 if(!quota||typeof quota!=='object')return [];
 const rows=[];
 const byLimit=quota.rateLimitsByLimitId;
 if(byLimit&&typeof byLimit==='object'&&!Array.isArray(byLimit)){
  for(const [limitId,group] of Object.entries(byLimit)){
   if(!group||typeof group!=='object')continue;
   rows.push(quotaRow('主窗口',group.primary,limitId));
   rows.push(quotaRow('次窗口',group.secondary,limitId));
  }
 }
 if(!rows.length&&quota.rateLimits&&typeof quota.rateLimits==='object'){
  rows.push(quotaRow('主窗口',quota.rateLimits.primary));
  rows.push(quotaRow('次窗口',quota.rateLimits.secondary));
 }
 return rows;
}

export function accountIdentity(account){
 return {
  label:esc(account?.label||account?.emailMasked||'未命名账号'),
  email:esc(account?.emailMasked||'未返回'),
  id:esc(account?.id||'未返回'),
  plan:esc(account?.planType||'未返回')
 };
}

export function operationStatusText(operation){
 if(!operation)return '';
 const kind=operation.kind,result=operation.result||{},status=operation.status;
 if(status==='failed'){const reason=operation.error?(knownErrors[operation.error]||String(operation.error)):'';return '操作未完成'+(reason?'：'+reason:'，请稍后重试。');}
 if(status==='queued')return kind==='wake'?'唤醒请求已排队，等待云端执行…':'额度刷新已排队，等待云端执行…';
 if(status==='running')return kind==='wake'?'正在发送一次最小真实推理请求…':'正在读取官方额度…';
 if(status==='ready'){
  if(kind==='wake'){
   const probe=result.probe||{},latency=numeric(probe.latencyMs);
   if(probe.passed===false)return '手动唤醒未通过'+(latency===null?'':'（'+latency+' ms）')+'。';
   if(probe.passed!==true)return '唤醒请求已结束，但未返回有效的验证结果。';
   const model=result.model||operation.model,effort=result.reasoningEffort||operation.effort;
   return '手动唤醒通过'+(latency===null?'':'（'+latency+' ms）')+(model?' · '+model:'')+(effort?' · '+effort:'')+(result.quota?'；额度已同步。':'。');
  }
  return result.quota?'官方额度已刷新。':'操作已完成，但官方未返回额度。';
 }
 return '等待云端返回…';
}

export function cloudErrorText(error){
 const code=error?.code||'';
 if(knownErrors[code])return knownErrors[code];
 if(/^CODEX_/.test(code))return '本次云端账号操作未完成，当前账号未改变，请稍后重试。';
 return error?.message||'本次云端账号操作未完成，请稍后重试。';
}

function safeId(value){
 const id=String(value??'').trim();
 return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)?id:'';
}

function deadline(value){
 const time=numeric(value);
 if(time!==null&&time>0)return time<1e11?time*1000:time;
 const parsed=Date.parse(String(value??''));
 return Number.isFinite(parsed)&&parsed>0?parsed:0;
}

function requestId(){
 try{return crypto.randomUUID();}
 catch{return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const n=Math.floor(Math.random()*16);return (c==='x'?n:(n&3)|8).toString(16);});}
}

async function writeClipboard(text){
 if(typeof navigator!=='undefined'&&navigator.clipboard?.writeText){
  await navigator.clipboard.writeText(text);
  return;
 }
 const area=document.createElement('textarea');
 area.value=text;
 area.setAttribute('readonly','');
 area.className='cloud-copy-fallback';
 document.body.appendChild(area);
 area.select();
 const copied=document.execCommand('copy');
 area.remove();
 if(!copied)throw Error('copy unavailable');
}

export function createCloudAccountPanel({root,api,requests,session,onAuthRequired,wakeDefaults}){
 if(!root)return {load:async()=>{},forget(){},resume(){},render(){}};
 const node=id=>root.querySelector('#'+id);
 const statusNode=node('cloud-accounts-status'),listNode=node('cloud-account-list'),flowNode=node('cloud-auth-flow'),opNode=node('cloud-op-state'),addButton=node('cloud-account-add'),refreshButton=node('cloud-account-refresh');
 let data=null,loadError='',loading=null,active=true,busy=false;
 let attempt=null,flow=null,authBusy=false,cancelBusy=false,needsAuth=false;
 let operation=null,lastOperation='';
 let epoch=0,authEpoch=0,opEpoch=0,authTimer=0,opTimer=0,authAttempts=0,opAttempts=0;
 let flowStamp='';

 try{
  const saved=safeId(localStorage.getItem(CLOUD_AUTH_STORAGE));
  if(saved)attempt={id:saved,expiresAt:0};
 }catch{}

 const allowed=()=>!!session?.();
 const locked=()=>busy||authBusy||!!attempt||!!operation||needsAuth;
 const findAccount=id=>(data?.accounts||[]).find(account=>String(account.id)===String(id))||null;
 const accountLabel=account=>account?.label||account?.emailMasked||'云端账号';
 const authError=error=>error?.status===401||error?.code==='AUTH_REQUIRED'||error?.code==='AUTH_EXPIRED';
 const goneError=error=>error?.status===404||['CODEX_OPERATION_NOT_FOUND','CODEX_NOT_ENABLED','CODEX_ACCOUNT_NOT_FOUND','CODEX_INPUT_INVALID'].includes(error?.code);

 function renderStatus(text,error=false){
  if(!statusNode)return;
  statusNode.textContent=text;
  statusNode.classList.toggle('is-error',!!error);
 }
 function rememberAttempt(id){
  try{if(id)localStorage.setItem(CLOUD_AUTH_STORAGE,id);else localStorage.removeItem(CLOUD_AUTH_STORAGE);}catch{}
 }
 function clearAttempt(){
  clearTimeout(authTimer);authTimer=0;attempt=null;authBusy=false;authAttempts=0;rememberAttempt('');
 }
 function stopAuth(){
  authEpoch++;clearAttempt();
 }
 function authDelay(){
  const delay=Math.min(1500*2**Math.min(authAttempts,3),8000);
  authAttempts++;
  return delay;
 }
 function scheduleAuth(delay=0){
  clearTimeout(authTimer);authTimer=0;
  if(!active||!attempt||needsAuth)return;
  if(typeof document!=='undefined'&&document.hidden)return;
  authTimer=setTimeout(()=>{authTimer=0;pollAuth();},Math.max(0,delay));
 }
 function opDelay(){
  const delay=Math.min(1200*2**Math.min(opAttempts,3),8000);
  opAttempts++;
  return delay;
 }
 function scheduleOperation(delay=0){
  clearTimeout(opTimer);opTimer=0;
  if(!active||!operation||needsAuth)return;
  if(typeof document!=='undefined'&&document.hidden)return;
  opTimer=setTimeout(()=>{opTimer=0;pollOperation();},Math.max(0,delay));
 }

 function quotaHTML(quota){
  const rows=quotaRows(quota);
  if(!rows.length){
   return '<section class="cloud-quota"><div class="cloud-quota-head"><b>官方额度</b><span>未返回</span></div><p class="cloud-missing">官方暂未返回额度信息；这里不显示推算的剩余次数。</p></section>';
  }
  const updated=quota?.fetchedAt?cloudTime(quota.fetchedAt):'';
  return '<section class="cloud-quota"><div class="cloud-quota-head"><b>官方额度</b><span>'+(updated?'更新于 '+esc(updated):'更新时间未返回')+'</span></div><div class="cloud-quota-grid">'+
   rows.map(row=>'<div class="cloud-quota-row"><span class="cloud-quota-label">'+esc((row.limitId?row.limitId+' · ':'')+row.label)+'</span><b>剩余 '+esc(row.remainingText)+'</b><span class="cloud-quota-detail">已用 '+esc(row.usedText)+' · 窗口 '+esc(row.windowText)+' · 重置 '+esc(row.resetsText)+'</span></div>').join('')+
   '</div></section>';
 }

 function compactQuota(quota){
  const rows=quotaRows(quota);
  if(!rows.length)return '官方额度未返回';
  const updated=quota?.fetchedAt?cloudTime(quota.fetchedAt):'';
  return esc(rows.slice(0,2).map(row=>(row.limitId?row.limitId+' · ':'')+row.label+' 剩余 '+row.remainingText+' · 已用 '+row.usedText+' · '+row.windowText+' · 重置 '+row.resetsText).join(' / '))+(updated?' · 更新 '+esc(updated):' · 更新时间未返回');
 }

 function currentHTML(account){
  const identity=accountIdentity(account),needs=account.status==='reauthorize',statusText=needs?'需重新授权':account.status==='ready'?'可用':'状态未返回';
  return '<article class="cloud-current">'+
   '<div class="cloud-current-info"><div class="cloud-card-head"><span class="cloud-badge">当前账号</span><span class="cloud-state'+(needs?' is-warn':'')+'">'+statusText+'</span></div>'+
   '<b class="cloud-name">'+identity.label+'</b><p class="cloud-email">'+identity.email+'</p>'+
   '<dl class="cloud-meta"><div><dt>计划</dt><dd>'+identity.plan+'</dd></div><div><dt>最近授权</dt><dd>'+esc(cloudTime(account.authorizedAt)||'未返回')+'</dd></div></dl></div>'+
   quotaHTML(account.quota)+
   '<div class="cloud-account-actions">'+
    '<button type="button" class="quiet" data-cloud-reauth="'+esc(account.id)+'"'+(locked()?' disabled':'')+'>重新授权</button>'+
    '<button type="button" class="quiet" data-cloud-quota="'+esc(account.id)+'"'+(locked()?' disabled':'')+'>刷新真实额度</button>'+
    '<button type="button" class="quiet" data-cloud-wake="'+esc(account.id)+'"'+(account.status!=='ready'||locked()?' disabled':'')+'>手动唤醒</button>'+
   '</div>'+
   '<p class="cloud-note">点击“手动唤醒”会发送一次轻量请求，消耗少量额度。</p>'+
  '</article>';
 }

 function savedHTML(accounts){
  if(!accounts.length)return '<p class="cloud-empty-copy">没有其他已保存账号。添加账号后可在这里切换。</p>';
  return '<div class="cloud-saved"><div class="cloud-saved-head"><b>其他已保存账号</b><span>'+accounts.length+' 个</span></div>'+
   accounts.map(account=>{
    const identity=accountIdentity(account),needs=account.status==='reauthorize',statusText=needs?'需重新授权':account.status==='ready'?'可用':'状态未返回';
    return '<div class="cloud-account-row">'+
     '<div class="cloud-account-main"><b>'+identity.label+'</b><span>'+identity.email+' · '+identity.plan+' · '+statusText+'</span><span class="cloud-row-quota">'+compactQuota(account.quota)+'</span></div>'+
     '<div class="cloud-account-row-actions">'+
      '<button type="button" class="cloud-switch" data-cloud-active="'+esc(account.id)+'"'+(account.status!=='ready'||locked()?' disabled':'')+'>设为当前</button>'+
      '<button type="button" class="quiet" data-cloud-reauth="'+esc(account.id)+'"'+(locked()?' disabled':'')+'>重新授权</button>'+
      '<button type="button" class="quiet" data-cloud-quota="'+esc(account.id)+'"'+(locked()?' disabled':'')+'>刷新额度</button>'+
     '</div></div>';
   }).join('')+'</div>';
 }

 function renderList(){
  if(!listNode)return;
  if(!data){
   listNode.innerHTML='<div class="cloud-empty"><b>'+(loadError?'暂时无法读取云端账号':'正在读取云端账号…')+'</b><p>'+esc(loadError||'登录后由云端返回账号、授权状态与官方额度。')+'</p></div>';
   return;
  }
  if(data.enabled!==true){
   listNode.innerHTML='<div class="cloud-empty is-disabled"><b>云端官方授权未启用</b><p>云端尚未开启 OpenAI 官方授权，当前不能添加、切换或唤醒官方账号；现有模型服务不受影响。</p></div>';
   return;
  }
  const accounts=Array.isArray(data.accounts)?data.accounts:[];
  if(!accounts.length){
   listNode.innerHTML='<div class="cloud-empty"><b>还没有云端官方账号</b><p>点上方“添加账号”，使用现有 ChatGPT / OpenAI 账号在官方页面确认；授权成功后才会加入。</p></div>';
   return;
  }
  const current=accounts.find(account=>account.active||String(account.id)===String(data.activeId))||null;
  const others=accounts.filter(account=>account!==current);
  listNode.innerHTML=(current?currentHTML(current):'<div class="cloud-empty"><b>还没有当前账号</b><p>从下方账号中选一个“设为当前”，新任务才会使用它。</p></div>')+savedHTML(others);
 }

 function flowHTML(){
  if(!flow)return '';
  const safe=verificationUrl(flow.verificationUrl),hasRaw=!!flow.verificationUrl;
  const code=flow.userCode?String(flow.userCode):'';
  const expires=flow.expiresAt?cloudTime(flow.expiresAt):'';
  const busy=FLOW_BUSY.has(flow.state);
  const dismiss=FLOW_TERMINAL.has(flow.state)?'<button type="button" class="quiet" data-cloud-dismiss>关闭</button>':!busy&&flow.state!=='auth'?'<button type="button" class="quiet" data-cloud-dismiss>关闭</button>':'';
  const cancel=busy&&attempt?'<button type="button" class="quiet" data-cloud-cancel'+(cancelBusy?' disabled':'')+'>停止本次授权</button>':'';
  const stage=flow.state==='complete'?3:flow.state==='waiting'?2:1;
  const steps=['auth','failed','cancelled','expired'].includes(flow.state)?'':'<ol class="cloud-flow-steps">'+['云端创建本次授权','在官方页面确认设备码','账号更新并可切换'].map((label,index)=>'<li class="'+(flow.state==='complete'||index+1<stage?'is-done':index+1===stage?'is-current':'')+'">'+esc(label)+'</li>').join('')+'</ol>';
  const device=code?'<div class="cloud-device"><span class="cloud-device-label">设备码</span><code class="cloud-device-code">'+esc(code)+'</code><button type="button" class="cloud-copy" data-cloud-copy>复制设备码</button></div>':'';
  const link=safe?'<div class="cloud-link"><a class="cloud-open" href="'+esc(safe)+'" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">打开官方授权页面 ↗</a><span>'+esc(safe)+'</span></div>':hasRaw?'<p class="cloud-warning">官方链接未通过校验，已隐藏；请停止后重试。</p>':flow.state==='waiting'?'<p class="cloud-warning">官方页面链接尚未返回，请稍候或停止后重新开始。</p>':'';
  const expiry=(flow.state==='queued'||flow.state==='waiting')?'<p class="cloud-expiry">'+(expires?'设备码在 '+esc(expires)+' 前有效。':'有效期以官方页面为准。')+'</p>':'';
  return '<div class="cloud-flow-inner is-'+esc(flow.state)+'" role="status" aria-live="polite">'+
   '<div class="cloud-flow-head"><span class="cloud-flow-mark" aria-hidden="true"></span><div class="cloud-flow-copy"><b>'+esc(flow.title||'')+'</b><p>'+esc(flow.text||'')+'</p></div>'+cancel+dismiss+'</div>'+
   steps+device+link+expiry+
   '<p class="cloud-safe">本页不保存令牌、设备码或密码；刷新后只凭本次授权编号继续查询。</p>'+
  '</div>';
 }
 function renderFlow(){
  if(!flowNode)return;
  flowNode.hidden=!flow;
  if(!flow){flowStamp='';flowNode.innerHTML='';return;}
  const stamp=JSON.stringify([flow.state,flow.title,flow.text,flow.verificationUrl,flow.userCode,flow.expiresAt,cancelBusy]);
  if(stamp===flowStamp)return;
  flowStamp=stamp;
  flowNode.innerHTML=flowHTML();
 }
 function setFlow(next){flow=next;renderFlow();}
 function renderOperation(){
  if(!opNode)return;
  const text=operation?((findAccount(operation.accountId)?accountLabel(findAccount(operation.accountId))+' · ':'')+operationStatusText(operation)):lastOperation;
  opNode.textContent=text;
  opNode.hidden=!text;
 }
 function updateActions(){
  const enabled=data?.enabled===true;
  if(addButton){addButton.hidden=!enabled;addButton.disabled=!enabled||busy||authBusy||!!attempt||!!operation||needsAuth;}
  if(refreshButton)refreshButton.disabled=!allowed()||busy||authBusy||!!operation;
 }
 function renderAll(){renderList();renderFlow();renderOperation();updateActions();}
 function render(){renderAll();}

 function authRequired(forAttempt=true){
  needsAuth=true;authBusy=false;cancelBusy=false;
  if(!data)loadError='教师验证已过期，重新输入动态验证码后加载云端账号。';
  clearTimeout(authTimer);authTimer=0;clearTimeout(opTimer);opTimer=0;
  if(forAttempt&&(attempt||flow)){
   const previous=flow&&['starting','queued','waiting','cancelling','auth'].includes(flow.state)?flow:{state:'auth'};
   setFlow({...previous,state:'auth',title:'教师验证已过期',text:'重新输入动态验证码后，本次授权会继续查询；设备码可能仍在有效期内。'});
  }
  renderStatus('教师验证已过期，请重新输入动态验证码；云端账号与本次授权进度会保留。',true);
  renderAll();
  onAuthRequired?.();
 }

 async function load({quiet=false}={}){
  active=true;
  if(!allowed())return null;
  if(loading)return loading;
  const mark=epoch,ticket=requests.begin('cloud-accounts');
  if(!quiet)renderStatus('正在读取云端官方账号…');
  loading=(async()=>{
   try{
    const next=await api('/admin/codex/accounts',{keepSession:true});
    if(mark!==epoch||!requests.current(ticket)||!allowed())return null;
    data=next&&typeof next==='object'?next:null;
    loadError='';needsAuth=false;
    if(data?.enabled!==true||(!attempt&&flow?.state==='auth')){flow=null;flowStamp='';}
    if(data)renderStatus(data.enabled===true?(data.accounts?.length?data.accounts.length+' 个云端账号 · 独立管理授权会话':'还没有云端官方账号'):'云端官方授权未启用，当前仍使用已配置的模型服务');
    renderAll();
    if(data?.enabled===true&&attempt&&!needsAuth){
     if(!flow||['starting','queued','waiting','auth'].includes(flow.state))setFlow({...flow,state:'queued',title:'继续查询本次授权',text:'正在查询上次的官方授权进度…',expiresAt:attempt.expiresAt});
     scheduleAuth(0);
    }
    if(data?.enabled===true&&operation?.id&&!opTimer)scheduleOperation(0);
    return data;
   }catch(error){
    if(mark!==epoch||!requests.current(ticket)||!allowed())return null;
    if(authError(error)){authRequired(false);return null;}
    loadError=cloudErrorText(error);
    renderStatus('云端账号服务暂时不可用；出题、图示与次数设置不受影响。',true);
    renderAll();
    return null;
   }finally{loading=null;}
  })();
  return loading;
 }

 async function begin(mode,accountId){
  if(!data||data.enabled!==true||busy||authBusy||needsAuth)return;
  stopAuth();
  const mark=authEpoch;
  authBusy=true;cancelBusy=false;needsAuth=false;
  setFlow({state:'starting',title:mode==='add'?'正在添加 OpenAI 账号':'正在重新授权',text:'正在向云端申请一次性授权，请稍候…'});
  renderStatus('正在申请 OpenAI 官方授权…');
  renderAll();
  try{
   const result=await api('/admin/codex/authorize',{method:'POST',id:requestId(),body:mode==='add'?{mode:'add'}:{mode:'reauthorize',accountId},keepSession:true});
   if(mark!==authEpoch||!allowed()){
    authBusy=false;renderAll();return;
   }
   const id=safeId(result?.id);
   if(!id)throw Object.assign(Error('云端没有返回本次授权编号，请重试。'),{code:'CODEX_AUTHORIZATION_NOT_FOUND'});
   attempt={id,expiresAt:deadline(result.expiresAt)};
   rememberAttempt(id);
   authBusy=false;
   const state=result.status==='waiting'?'waiting':'queued';
   setFlow({state,title:state==='waiting'?'等待在官方页面确认':'正在准备官方页面',text:state==='waiting'?'请在官方页面输入设备码并确认；此页会自动查询结果，无需本机助手。':'云端正在生成设备码，请稍候…',expiresAt:attempt.expiresAt});
   renderStatus(state==='waiting'?'等待在官方页面确认，完成后会自动刷新账号。':'云端正在准备官方设备码…');
   renderAll();
   scheduleAuth(600);
  }catch(error){
   if(mark!==authEpoch)return;
   authBusy=false;
   if(authError(error)){
    stopAuth();authRequired(true);return;
   }
   clearAttempt();
   setFlow({state:'failed',title:'本次授权未开始',text:cloudErrorText(error)});
   renderAll();
  }
 }

 async function finishAuth(result){
  clearAttempt();needsAuth=false;cancelBusy=false;
  setFlow({state:'complete',title:'授权完成',text:'云端已确认官方账号，正在刷新账号列表…'});
  renderAll();
  try{await load({quiet:true});}catch{}
  if(needsAuth){renderAll();return;}
  const account=findAccount(result?.accountId)||(data?.accounts||[]).find(item=>item.active)||null;
  const isActive=!!account&&(account.active||String(account.id)===String(data?.activeId));
  setFlow({state:'complete',title:'官方账号已更新',text:account?accountLabel(account)+' 已可用；'+(isActive?'该账号已保存在云端，可在此切换。':'可在账号列表中设为当前。')+'现有计划通道保持独立。':'云端已确认本次授权，账号列表已刷新。'});
  renderStatus('官方授权已完成，云端账号列表已更新。');
  renderAll();
 }

 function failAuth(state,text){
  clearAttempt();needsAuth=false;cancelBusy=false;
  const title=state==='cancelled'?'已停止本次授权':state==='expired'?'本次授权已过期':'本次授权未完成';
  setFlow({state,title,text});
  renderStatus(text,state==='failed');
  renderAll();
 }

 async function pollAuth(){
  if(!active||!allowed()||!attempt||needsAuth)return;
  if(typeof document!=='undefined'&&document.hidden)return;
  const mark=authEpoch,id=attempt.id,ticket=requests.begin('cloud-auth');
  try{
   const result=await api('/admin/codex/authorize/'+encodeURIComponent(id),{keepSession:true});
   if(mark!==authEpoch||!requests.current(ticket)||!allowed())return;
   authAttempts=0;
   const expires=deadline(result.expiresAt);
   if(expires)attempt.expiresAt=expires;
   if(result.status==='complete'){await finishAuth(result);return;}
   if(result.status==='failed'){failAuth('failed',cloudErrorText({code:result.error||'CODEX_OPERATION_FAILED'}));return;}
   if(result.status==='cancelled'){failAuth('cancelled','本次授权已取消，当前账号未改变。');return;}
   if(result.status==='expired'){failAuth('expired','本次授权已过期，请重新开始；当前账号未改变。');return;}
   if(result.status==='waiting'){
    setFlow({state:'waiting',title:'等待在官方页面确认',text:'请在官方页面输入设备码，并用现有 ChatGPT / OpenAI 账号确认。此页会自动查询结果，无需本机助手。',verificationUrl:result.verificationUrl,userCode:result.userCode,expiresAt:attempt.expiresAt});
    renderStatus('等待在官方页面确认，完成后会自动刷新账号。');
    renderAll();scheduleAuth(2500);return;
   }
   if(attempt.expiresAt&&Date.now()>=attempt.expiresAt){failAuth('expired','本次授权已过期，请重新开始；当前账号未改变。');return;}
   setFlow({state:'queued',title:'正在准备官方页面',text:'云端正在生成设备码，请稍候…',verificationUrl:result.verificationUrl,userCode:result.userCode,expiresAt:attempt.expiresAt});
   renderStatus('云端正在准备官方设备码…');
   renderAll();scheduleAuth(2000);
  }catch(error){
   if(mark!==authEpoch||!requests.current(ticket))return;
   if(authError(error)){authRequired(true);return;}
   if(goneError(error)){failAuth('failed',cloudErrorText(error));return;}
   if(attempt?.expiresAt&&Date.now()>=attempt.expiresAt){failAuth('expired','本次授权已过期，请重新开始；当前账号未改变。');return;}
   if(flow)setFlow({...flow,title:'正在重新连接',text:'授权仍在云端进行；网络恢复后会自动继续查询。'});
   renderStatus('授权仍在云端进行，正在重新连接…');
   renderAll();scheduleAuth(authDelay());
  }
 }

 async function cancelAuth(){
  if(!attempt||cancelBusy)return;
  authEpoch++;
  const id=attempt.id,mark=authEpoch,ticket=requests.begin('cloud-cancel');
  cancelBusy=true;clearTimeout(authTimer);authTimer=0;
  if(flow)setFlow({...flow,title:'正在停止本次授权',text:'正在通知云端取消，请稍候…'});
  renderStatus('正在停止本次授权…');
  renderAll();
  try{
   const result=await api('/admin/codex/authorize/'+encodeURIComponent(id)+'/cancel',{method:'POST',id:requestId(),body:{},keepSession:true});
   if(mark!==authEpoch||!requests.current(ticket)||!allowed())return;
   const state=typeof result==='string'?result:result?.status;
   cancelBusy=false;
   if(state==='complete'){await finishAuth(result||{});return;}
   if(state==='failed'){failAuth('failed',cloudErrorText({code:result?.error||'CODEX_OPERATION_FAILED'}));return;}
   if(state==='expired'){failAuth('expired','本次授权已过期；当前账号未改变。');return;}
   if(state==='cancelled'){failAuth('cancelled','本次授权已取消，当前账号未改变。');return;}
   if(flow)setFlow({...flow,title:'正在停止本次授权',text:'云端已收到取消请求，正在确认状态…'});
   renderAll();scheduleAuth(1200);
  }catch(error){
   if(mark!==authEpoch||!requests.current(ticket))return;
   cancelBusy=false;
   if(authError(error)){authRequired(true);return;}
   if(goneError(error)){failAuth('failed',cloudErrorText(error));return;}
   if(flow)setFlow({...flow,title:'暂未停止',text:cloudErrorText(error)});
   renderAll();scheduleAuth(1500);
  }
 }

 async function setActive(accountId){
  if(!data||data.enabled!==true||busy||operation||needsAuth)return;
  const revision=Number(data.revision);
  if(!Number.isSafeInteger(revision)){renderStatus('云端未返回配置版本，请刷新后再切换。',true);return;}
  const account=findAccount(accountId);
  if(!account)return;
  const mark=epoch,ticket=requests.begin('cloud-active');
  busy=true;needsAuth=false;
  renderStatus('正在切换当前账号：'+accountLabel(account)+'…');
  renderAll();
  try{
   const next=await api('/admin/codex/accounts/active',{method:'POST',id:requestId(),body:{accountId,expectedRevision:revision},keepSession:true});
   if(mark!==epoch||!requests.current(ticket)||!allowed())return;
   if(next&&Array.isArray(next.accounts))data={...data,...next,enabled:next.enabled??data?.enabled??true};
   else await load({quiet:true});
   renderStatus('已切换当前账号：'+accountLabel(account)+'。现有计划通道保持独立。');
  }catch(error){
   if(mark!==epoch||!requests.current(ticket))return;
   if(authError(error)){authRequired(false);return;}
   if(error.code==='CODEX_AUTHORIZATION_CONFLICT'||/REVISION/i.test(error.code||''))await load({quiet:true});
   renderStatus(cloudErrorText(error),true);
  }finally{
   if(mark===epoch&&requests.current(ticket)){busy=false;renderAll();}
  }
 }

 async function startOperation(kind,accountId,body){
  const mark=epoch,ticket=requests.begin('cloud-'+kind+'-start');
  operation={id:'',kind,accountId,status:'running',model:body?.model,effort:body?.effort};
  lastOperation='';opEpoch++;opAttempts=0;
  renderAll();
  try{
   const result=await api('/admin/codex/accounts/'+encodeURIComponent(accountId)+'/'+kind,{method:'POST',id:requestId(),body,keepSession:true});
   if(mark!==epoch||!requests.current(ticket)||!allowed()){
    if(operation&&!operation.id)operation=null;
    return;
   }
   const id=safeId(result?.id);
   if(!id)throw Object.assign(Error('云端没有返回本次操作编号，请稍后重试。'),{code:'CODEX_OPERATION_FAILED'});
   operation={id,kind,accountId,status:result.status||'queued',model:body?.model,effort:body?.effort,attempts:0};
   renderAll();scheduleOperation(600);
  }catch(error){
   if(mark!==epoch||!requests.current(ticket)){
    if(operation&&!operation.id)operation=null;
    return;
   }
   operation=null;
   if(authError(error)){authRequired(false);return;}
   renderStatus(cloudErrorText(error),true);
   renderAll();
  }
 }

 async function refreshQuota(accountId){
  if(!data||data.enabled!==true||operation||busy||authBusy||needsAuth)return;
  const account=findAccount(accountId);
  if(!account)return;
  renderStatus('正在请求刷新 '+accountLabel(account)+' 的官方额度…');
  await startOperation('quota',accountId,{});
 }

 async function wakeAccount(accountId){
  if(!data||data.enabled!==true||operation||busy||authBusy||needsAuth)return;
  const account=findAccount(accountId);
  if(!account)return;
  if(account.status==='reauthorize'){renderStatus('这个账号需要重新授权后才能唤醒。',true);return;}
  const config=typeof wakeDefaults==='function'?wakeDefaults():null;
  const model=String(config?.model||'').trim(),effort=String(config?.effort||'').trim();
  if(!model||!effort){renderStatus('没有可用的 openai-codex 模型配置，已取消唤醒。',true);return;}
  renderStatus('正在提交一次最小真实推理请求；会消耗少量额度。');
  await startOperation('wake',accountId,{model,effort});
 }

 async function pollOperation(){
  if(!active||!allowed()||!operation||needsAuth)return;
  if(typeof document!=='undefined'&&document.hidden)return;
  const mark=opEpoch,id=operation.id,ticket=requests.begin('cloud-operation');
  try{
   const result=await api('/admin/codex/operations/'+encodeURIComponent(id),{keepSession:true});
   if(mark!==opEpoch||!requests.current(ticket)||!allowed())return;
   if(result.status==='ready'){
    const finished={...operation,status:'ready',result};
    const account=findAccount(operation.accountId);
    operation=null;opAttempts=0;
    // Read the authoritative current session snapshot. A quota operation from
    // an older authorization must not replace a newly authorized account view.
    if(result.quota)await load({quiet:true});
    if(mark!==opEpoch||!allowed())return;
    lastOperation=(account?accountLabel(account)+' · ':'')+operationStatusText(finished);
    renderStatus(finished.kind==='wake'?(result.probe?.passed===false?'手动唤醒未通过；当前账号未改变。':(result.quota?'手动唤醒已完成，官方额度已同步。':'手动唤醒已完成；未自动刷新额度。')):(result.quota?'官方额度已刷新。':'操作已完成，但官方未返回额度。'),finished.kind==='wake'&&result.probe?.passed===false);
    renderAll();return;
   }
   if(result.status==='failed'){
    const failed={...operation,status:'failed',error:result.error||'云端未返回原因。'};
    const account=findAccount(operation.accountId);
    operation=null;opAttempts=0;
    lastOperation=(account?accountLabel(account)+' · ':'')+operationStatusText(failed);
    renderStatus('本次账号操作未完成，当前账号未改变。',true);
    renderAll();return;
   }
   operation.status=result.status||'running';
   opAttempts=0;renderOperation();
   scheduleOperation(result.status==='running'?2500:1500);
  }catch(error){
   if(mark!==opEpoch||!requests.current(ticket))return;
   if(authError(error)){authRequired(false);return;}
   if(goneError(error)){
    const account=findAccount(operation?.accountId);
    lastOperation=(account?accountLabel(account)+' · ':'')+'操作未完成：'+cloudErrorText(error);
    operation=null;renderStatus('本次账号操作未完成，当前账号未改变。',true);renderAll();return;
   }
   renderOperation();scheduleOperation(opDelay());
  }
 }

 const onVisibility=()=>{
  if(typeof document==='undefined'||document.hidden)return;
  if(attempt&&!needsAuth&&!authTimer)scheduleAuth(0);
  if(operation?.id&&!needsAuth&&!opTimer)scheduleOperation(0);
 };
 if(typeof document!=='undefined')document.addEventListener('visibilitychange',onVisibility);

 root.addEventListener('click',event=>{
  const copy=event.target.closest('[data-cloud-copy]');
  if(copy){
   const text=flow?.userCode?String(flow.userCode):'';
   if(!text)return;
   const original=copy.textContent;
   writeClipboard(text).then(()=>{copy.textContent='已复制';copy.classList.add('is-copied');}).catch(()=>{copy.textContent='请手动选择';}).finally(()=>setTimeout(()=>{if(copy.isConnected){copy.textContent=original;copy.classList.remove('is-copied');}},1600));
   return;
  }
  if(event.target.closest('[data-cloud-cancel]')){cancelAuth();return;}
  if(event.target.closest('[data-cloud-dismiss]')){flow=null;renderFlow();return;}
  if(event.target.closest('#cloud-account-add')){begin('add');return;}
  if(event.target.closest('#cloud-account-refresh')){load({quiet:false});return;}
  const activeButton=event.target.closest('[data-cloud-active]');
  if(activeButton){setActive(activeButton.dataset.cloudActive);return;}
  const reauth=event.target.closest('[data-cloud-reauth]');
  if(reauth){begin('reauthorize',reauth.dataset.cloudReauth);return;}
  const quota=event.target.closest('[data-cloud-quota]');
  if(quota){refreshQuota(quota.dataset.cloudQuota);return;}
  const wake=event.target.closest('[data-cloud-wake]');
  if(wake){wakeAccount(wake.dataset.cloudWake);return;}
 });

 function forget(){
  active=false;epoch++;authEpoch++;opEpoch++;
  clearTimeout(authTimer);authTimer=0;clearTimeout(opTimer);opTimer=0;
  if(operation&&!operation.id)operation=null;
  busy=false;authBusy=false;cancelBusy=false;needsAuth=false;loading=null;loadError='';
  lastOperation='';flowStamp='';
  if(statusNode){statusNode.textContent=data||attempt?'登录后继续查询云端官方账号。':'登录后加载云端官方账号。';statusNode.classList.remove('is-error');}
  updateActions();
 }

 function resume(){
  if(!allowed())return;
  active=true;needsAuth=false;busy=false;authBusy=false;
  if(attempt&&!authTimer)scheduleAuth(0);
  if(operation?.id&&!opTimer)scheduleOperation(0);
  renderAll();
 }

 return {load,forget,resume,render,begin};
}
