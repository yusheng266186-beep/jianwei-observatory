// ChatGPT official-account panel. The module never reads or stores OAuth tokens:
// launch tickets stay in this tab's memory only and are validated against the
// fixed local-helper origin before a window is opened.
import {esc} from '../app/ui/html.js';

export const ACCOUNT_HELPER_ORIGIN='http://127.0.0.1:24765';
export const ACCOUNT_HELPER_DOWNLOAD='./assets/downloads/jianwei-auth-helper-macos.zip';
export const ACCOUNT_HELPER_SCRIPT='./tools/openai-auth-assistant.cjs';

export function accountHelperLaunch(value){
 try{
  const url=new URL(String(value||''));
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.port!=='24765')return '';
  if(url.username||url.password||url.pathname!=='/'||url.search)return '';
  if(!url.hash||url.hash.length<8)return '';
  return url.href;
 }catch{return '';}
}

export function accountHelperDownload(value){
 return [ACCOUNT_HELPER_DOWNLOAD,ACCOUNT_HELPER_SCRIPT].includes(value)?value:'';
}

export function accountStatusLabel(status){
 return {active:'当前使用',saved:'已保存',reauthorize:'需重新授权'}[status]||'已保存';
}

export function accountTime(value){
 const at=Number(value);
 if(!Number.isFinite(at)||at<=0)return '';
 return new Date(at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
}

const accountErrors={
 OPENAI_AUTH_TEMPORARY:'官方登录暂时不可用，请稍后重试；当前账号未改变。',
 OPENAI_ACCOUNT_NOT_FOUND:'这个账号已不在云端名单中，当前账号未改变。',
 OPENAI_ACCOUNT_REAUTH_UNAVAILABLE:'这个账号缺少重新授权所需的信息，请添加新账号。',
 OPENAI_AUTHORIZATION_NOT_FOUND:'本次授权已失效，请重新开始；当前账号未改变。',
 OPENAI_AUTHORIZATION_EXPIRED:'本次授权已过期，请重新开始；当前账号未改变。',
 OPENAI_AUTHORIZATION_CANCELLED:'本次授权已取消，当前账号未改变。',
 OPENAI_AUTHORIZATION_ALREADY_COMPLETE:'账号已完成切换，正在刷新。',
 OPENAI_AUTHORIZATION_IN_PROGRESS:'云端正在完成验证，请稍候。',
 OPENAI_AUTHORIZATION_CONFLICT:'另一处已切换账号，请刷新后重试；当前账号未改变。',
 OPENAI_AUTHORIZATION_UNCERTAIN:'云端未能确认本次授权结果，请刷新账号后再试；当前账号未改变。',
 OPENAI_AUTHORIZATION_DENIED:'官方登录被拒绝，请重试；当前账号未改变。',
 OPENAI_AUTHORIZATION_IDENTITY_INVALID:'官方返回的账号信息未通过验证，当前账号未改变。',
 OPENAI_AUTHORIZATION_IDENTITY_MISMATCH:'登录的账号与所选账号不一致，当前账号未改变。',
 OPENAI_AUTHORIZATION_SCOPE_MISSING:'官方授权缺少必要权限，请重新授权。',
 OPENAI_AUTHORIZATION_TOKEN_INVALID:'官方令牌未通过云端校验，当前账号未改变。',
 OPENAI_AUTHORIZATION_CLIENT_MISMATCH:'官方授权与当前账号不匹配，当前账号未改变。',
 OPENAI_AUTHORIZATION_REQUEST_INVALID:'本次授权参数无效，请重新开始。',
 OPENAI_ACCOUNT_ID_INVALID:'账号标识无效，请刷新后重试。',
 AUTH_REQUIRED:'教师验证已过期，请重新输入动态验证码。',
 AUTH_EXPIRED:'教师验证已过期，请重新输入动态验证码。'
};

export function accountErrorText(error){
 const code=error?.code||'';
 if(accountErrors[code])return accountErrors[code];
 if(/^OPENAI_/.test(code))return '本次账号操作未完成，当前账号未改变，请稍后重试。';
 return error?.message||'本次账号操作未完成，当前账号未改变，请稍后重试。';
}

export function createAccountPanel({root,api,message,requests,session,onChanged}){
 if(!root)return {load:async()=>{},forget(){},render(){}};
 const host=id=>root.querySelector('#'+id);
 const activeNode=host('account-active'),savedNode=host('account-saved'),savedCount=host('account-saved-count'),statusNode=host('accounts-status'),flowNode=host('account-flow'),addButton=host('account-add'),reauthButton=host('account-reauth'),helperDownload=host('account-helper-download');
 let data=null,attempt=null,flow=null,busy=false,epoch=0,timer=0,authWindow=null,loading=null;
 const allowed=()=>!!session?.();
 const accountLabel=account=>account?.label||account?.emailMasked||'ChatGPT 账号';
 const activeAccount=()=>data?.accounts?.find(account=>account.active)||data?.accounts?.find(account=>account.status==='active')||null;

 function closeAuthWindow(){try{authWindow?.close();}catch{}authWindow=null;}
 function clearPoll(){clearTimeout(timer);timer=0;}
 function stopFlow(){epoch++;clearPoll();attempt=null;busy=false;flow=null;closeAuthWindow();}
 function updateActions(){
  const enabled=!!data?.enabled;
  if(addButton){addButton.hidden=!enabled;addButton.disabled=busy;}
  if(reauthButton){reauthButton.hidden=!enabled||!activeAccount();reauthButton.disabled=busy;}
 }
 function renderActive(){
  if(!activeNode)return;
  if(!data){activeNode.innerHTML='<p class="account-empty">正在读取当前账号…</p>';return;}
  if(!data.enabled){activeNode.innerHTML='<div class="account-empty"><b>官方账号未在云端启用</b><p>当前仍使用已配置的模型服务。启用后可在这里添加并切换官方账号。</p></div>';return;}
  const account=activeAccount();
  if(!account){activeNode.innerHTML='<div class="account-empty"><b>还没有当前账号</b><p>添加后将作为 ChatGPT 官方服务的当前账号；云端验证成功才会生效。</p></div>';return;}
  const needsAuth=account.status==='reauthorize',expires=Number(account.accessExpiresAt),expired=Number.isFinite(expires)&&expires>0&&expires<Date.now();
  activeNode.innerHTML='<div class="account-card-head"><span class="account-badge">当前账号</span><span class="account-state'+(needsAuth||expired?' is-warn':'')+'">'+(needsAuth?'需要重新授权':expired?'登录将自动续期':'已连接')+'</span></div>'+
   '<b class="account-name">'+esc(accountLabel(account))+'</b>'+
   (account.emailMasked?'<p class="account-email">'+esc(account.emailMasked)+'</p>':'')+
   '<dl class="account-meta"><div><dt>最近授权</dt><dd>'+esc(accountTime(account.authorizedAt)||'云端已记录')+'</dd></div><div><dt>访问令牌</dt><dd>'+(needsAuth?'请重新授权':expired?'已到期 · 自动刷新':'由云端保管')+'</dd></div></dl>'+
   '<p class="account-safe">令牌只保存在云端；本页只显示账号标识。</p>';
 }
 function renderSaved(){
  if(!savedNode)return;
  const saved=(data?.accounts||[]).filter(account=>!account.active&&account.status!=='active');
  if(savedCount)savedCount.textContent=saved.length?saved.length+' 个':'';
  if(!saved.length){savedNode.innerHTML='<p class="account-empty-copy">'+(data?.enabled?'切换或添加的账号会保存在这里；切换前需要再次通过官方验证。':'启用官方账号后，可保存多个账号并按需切换。')+'</p>';return;}
  savedNode.innerHTML=saved.map(account=>'<div class="account-row" data-account-row="'+esc(account.id)+'">'+
   '<div class="account-row-main"><b>'+esc(accountLabel(account))+'</b><span>'+esc(account.emailMasked||'仅云端保存账号标识')+' · '+esc(accountStatusLabel(account.status))+(account.status==='reauthorize'?' · 官方登录已失效':'')+'</span></div>'+
   '<div class="account-row-actions">'+
    (account.status==='reauthorize'
     ?'<button type="button" class="quiet" data-account-reauth="'+esc(account.id)+'">重新授权</button>'
     :'<button type="button" class="account-switch" data-account-switch="'+esc(account.id)+'">切换</button>')+
   '</div></div>').join('');
 }
 function renderStatus(copy){
  if(statusNode)statusNode.textContent=copy;
 }
 function render(){
  renderActive();renderSaved();updateActions();
  if(data)renderStatus(data.enabled?(data.accounts?.length?(data.accounts.length+' 个账号 · 切换需通过官方验证'):'还没有保存的账号'):'云端未启用官方账号，当前仍使用已配置的模型服务');
 }
 function flowHTML(){
  if(!flow)return '';
  const terminal=['complete','failed','expired','cancelled'].includes(flow.state);
  const steps=flow.state==='waiting'||flow.state==='exchanging'?[
   ['is-done','云端已创建本次授权'],
   [flow.state==='waiting'?'is-current':'is-done','在本机助手完成官方登录'],
   [flow.state==='exchanging'?'is-current':'', '云端验证成功后切换账号']
  ]:'';
  const launch=attempt&&flow.state==='waiting'?'<div class="account-launch">'+
   '<a class="button outline account-launch-link" href="'+esc(attempt.launchUrl)+'" target="_blank" rel="noopener noreferrer">打开官方授权页面 ↗</a>'+
   '<p>授权页由固定的本机助手地址打开；若窗口被浏览器拦截，可点上面的链接。</p></div>'+
   '<p class="account-flow-helper">本机助手未启动？<a href="'+esc(ACCOUNT_HELPER_DOWNLOAD)+'" download>下载 Mac 助手</a>，解压后双击“启动授权助手.command”，保持窗口开启。</p>':'';
  const cancel=attempt&&['waiting','exchanging'].includes(flow.state)?'<button type="button" class="quiet" data-account-cancel>停止本次授权</button>':!terminal?'<button type="button" class="quiet" data-account-cancel>取消</button>':'<button type="button" class="quiet" data-account-dismiss>关闭</button>';
  return '<div class="account-flow-inner is-'+esc(flow.state)+'" role="status" aria-live="polite">'+
   '<div class="account-flow-head"><span class="account-flow-mark" aria-hidden="true"></span><div class="account-flow-copy"><b>'+esc(flow.title)+'</b><p>'+esc(flow.text)+'</p></div>'+cancel+'</div>'+
   (steps?'<ol class="account-flow-steps">'+steps.map(([state,label])=>'<li class="'+state+'">'+esc(label)+'</li>').join('')+'</ol>':'')+
   launch+'</div>';
 }
 function renderFlow(){
  if(!flowNode)return;
  flowNode.hidden=!flow;
  flowNode.innerHTML=flowHTML();
 }
 function setFlow(next){
  const changed=!flow||flow.state!==next.state||flow.title!==next.title||flow.text!==next.text;
  flow=next;if(changed)renderFlow();
 }
 function openAuthWindow(){
  try{return window.open('','jianwei-openai-auth','popup=yes,width=560,height=760');}catch{return null;}
 }
 function openLaunch(url,opened){
  if(!url)return false;
  if(opened&&!opened.closed){
   try{opened.location.replace(url);return true;}catch{}
   try{opened.location.href=url;return true;}catch{}
  }
  return false;
 }
 async function finish(){
  clearPoll();attempt=null;busy=false;closeAuthWindow();
  setFlow({state:'complete',title:'云端验证通过',text:'正在刷新账号名单…'});
  try{await load({quiet:true});}catch{}
  const account=activeAccount(),label=account?accountLabel(account):'新账号';
  setFlow({state:'complete',title:'账号已切换',text:'云端验证通过，'+label+'已成为当前账号；新任务将使用该账号。'});
  updateActions();onChanged?.();
  message('官方账号已切换，新任务将使用 '+label+'。');
 }
 function failFlow(code,override){
  clearPoll();attempt=null;busy=false;closeAuthWindow();updateActions();
  const text=override||accountErrorText({code});
  const state=code==='OPENAI_AUTHORIZATION_EXPIRED'?'expired':code==='OPENAI_AUTHORIZATION_CANCELLED'?'cancelled':'failed';
  setFlow({state,title:state==='cancelled'?'已停止本次授权':state==='expired'?'本次授权已过期':'本次授权未完成',text});
  if(message)message(text,state==='failed');
 }
 function schedule(delay=1500){clearPoll();timer=setTimeout(poll,delay);}
 async function poll(){
  if(!attempt||!allowed())return;
  const mark=epoch,ticket=requests.ticket(),id=attempt.id;
  try{
   const result=await api('/admin/openai/authorize/'+encodeURIComponent(id));
   if(mark!==epoch||!requests.current(ticket)||!allowed())return;
   if(result.status==='waiting'){setFlow({state:'waiting',title:'等待完成官方登录',text:'请在本机助手窗口登录官方账号；完成后会自动返回，不需要刷新本页。'});schedule();return;}
   if(result.status==='exchanging'){setFlow({state:'exchanging',title:'云端正在验证',text:'已收到官方回调，正在校验并切换账号。' });schedule(1200);return;}
   if(result.status==='complete'){await finish();return;}
   if(result.status==='cancelled'){failFlow('OPENAI_AUTHORIZATION_CANCELLED');return;}
   if(result.status==='expired'){failFlow('OPENAI_AUTHORIZATION_EXPIRED');return;}
   if(result.status==='failed'){failFlow(result.error||'OPENAI_AUTHORIZATION_FAILED');return;}
   schedule(2500);
  }catch(error){
   if(mark!==epoch||!allowed()||error.code==='SESSION_CHANGED')return;
   if(attempt&&Date.now()>=Number(attempt.expiresAt)){failFlow('OPENAI_AUTHORIZATION_EXPIRED');return;}
   setFlow({state:'waiting',title:'正在重新连接',text:accountErrorText(error)+' 授权仍在云端进行，可稍后继续查看。'});
   schedule(3000);
  }
 }
 async function begin(mode,accountId){
  if(busy||!data?.enabled)return;
  const opened=openAuthWindow();authWindow=opened;
  busy=true;updateActions();epoch++;
  const mark=epoch;
  const title=mode==='add'?'正在添加官方账号':'正在授权账号';
  setFlow({state:'starting',title,text:'正在向云端申请一次性授权，请稍候…'});
  try{
   const result=await api('/admin/openai/authorize',{method:'POST',body:mode==='add'?{mode:'add'}:{mode:'reauthorize',accountId}});
   if(mark!==epoch||!allowed()){closeAuthWindow();return;}
   const launchUrl=accountHelperLaunch(result.launchUrl);
   if(!launchUrl)throw Object.assign(Error('云端返回的授权地址不在本机助手范围内，已停止本次操作。'),{code:'OPENAI_AUTHORIZATION_REQUEST_INVALID'});
   attempt={id:result.id,expiresAt:Number(result.expiresAt)||Date.now()+900000,launchUrl};
   const shown=openLaunch(launchUrl,opened);
   setFlow({state:'waiting',title:'等待完成官方登录',text:shown?'已在本机打开官方授权页面。完成登录后会自动返回；未看到窗口可点下方链接。':'请点下方按钮打开官方授权页面，完成登录后会自动返回。'});
   schedule(600);
  }catch(error){
   if(mark!==epoch)return;
   closeAuthWindow();busy=false;updateActions();
   const text=accountErrorText(error);
   setFlow({state:'failed',title:'本次授权未开始',text});
   if(message)message(text,true);
  }
 }
 async function cancel(){
  if(!attempt){stopFlow();renderFlow();return;}
  const id=attempt.id,mark=epoch,ticket=requests.ticket();
  try{
   await api('/admin/openai/authorize/'+encodeURIComponent(id)+'/cancel',{method:'POST',body:{}});
   if(mark!==epoch||!requests.current(ticket)||!allowed())return;
   failFlow('OPENAI_AUTHORIZATION_CANCELLED');
  }catch(error){
   if(mark!==epoch||!requests.current(ticket))return;
   if(error.code==='OPENAI_AUTHORIZATION_IN_PROGRESS'||error.code==='OPENAI_AUTHORIZATION_ALREADY_COMPLETE'){
    setFlow({state:'exchanging',title:'云端正在完成验证',text:'此刻不能取消；若验证失败，当前账号仍会保留。'});
    schedule(1000);return;
   }
   const text=accountErrorText(error);
   if(message)message(text,true);
  }
 }
 async function load({quiet=false}={}){
  if(!allowed())return null;
  if(loading)return loading;
  const mark=epoch,ticket=requests.begin('openai-accounts');
  if(!quiet)renderStatus('正在读取官方账号…');
  root.setAttribute('aria-busy','true');
  loading=(async()=>{
   try{
    const next=await api('/admin/openai/accounts');
    if(mark!==epoch||!requests.current(ticket)||!allowed())return null;
    data=next;
    const download=accountHelperDownload(next?.helper?.launcherDownload)||accountHelperDownload(next?.helper?.download);
    if(helperDownload&&download)helperDownload.setAttribute('href',download);
    render();return data;
   }catch(error){
    if(mark!==epoch||!requests.current(ticket)||!allowed()||error.code==='SESSION_CHANGED')return null;
    data={enabled:false,activeId:null,accounts:[]};
    renderActive();renderSaved();updateActions();
    renderStatus('账号服务暂不可用；出题、图示和额度设置不受影响。');
    return null;
   }finally{loading=null;root.removeAttribute('aria-busy');}
  })();
  return loading;
 }
 function forget(){
  stopFlow();data=null;
  if(activeNode)activeNode.innerHTML='';
  if(savedNode)savedNode.innerHTML='';
  if(savedCount)savedCount.textContent='';
  if(statusNode)statusNode.textContent='登录后加载账号。';
  if(flowNode){flowNode.hidden=true;flowNode.innerHTML='';}
  if(addButton)addButton.hidden=true;
  if(reauthButton)reauthButton.hidden=true;
 }
 root.addEventListener('click',event=>{
  const switcher=event.target.closest('[data-account-switch]');
  if(switcher){begin('reauthorize',switcher.dataset.accountSwitch);return;}
  const reauth=event.target.closest('[data-account-reauth]');
  if(reauth){begin('reauthorize',reauth.dataset.accountReauth);return;}
  if(event.target.closest('#account-add')){begin('add');return;}
  if(event.target.closest('#account-reauth')){const account=activeAccount();if(account)begin('reauthorize',account.id);return;}
  if(event.target.closest('[data-account-cancel]')){cancel();return;}
  if(event.target.closest('[data-account-dismiss]')){stopFlow();renderFlow();updateActions();return;}
 });
 return {load,forget,render,begin};
}
