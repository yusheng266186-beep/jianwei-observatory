import test from 'node:test';import assert from 'node:assert/strict';
import {CLOUD_AUTH_STORAGE,authorizationUrl,callbackUrl,verificationUrl,quotaRows,accountIdentity,operationStatusText,cloudTime,createCloudAccountPanel} from '../assets/workbench-cloud-accounts.js';
import {createRequestScope} from '../app/ui/request-scope.js';

const resetAt=1760000000;
const expectedReset=new Date(resetAt*1000).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
const ATTEMPT='11111111-1111-4111-8111-111111111111';
const AUTH_URL='https://auth.openai.com/oauth/authorize?response_type=code&client_id=app_test&redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&scope=openid%20profile%20email%20offline_access&state=state-123&code_challenge=pkce-456&code_challenge_method=S256';
const CALLBACK='http://localhost:1455/auth/callback?code=code-789&state=state-123';

test('官方登录链接只接受 auth.openai.com/oauth/authorize，且回调必须是 loopback /auth/callback',()=>{
 assert.equal(authorizationUrl(AUTH_URL),AUTH_URL);
 assert.equal(authorizationUrl('https://auth.openai.com/oauth/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A1455%2Fauth%2Fcallback&state=s&code_challenge=c'),'https://auth.openai.com/oauth/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A1455%2Fauth%2Fcallback&state=s&code_challenge=c');
 for(const value of [
  'http://auth.openai.com/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&state=s&code_challenge=c',
  'https://auth.openai.com.evil.example/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&state=s&code_challenge=c',
  'https://auth.openai.com@evil.example/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&state=s&code_challenge=c',
  'https://user:pass@auth.openai.com/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&state=s&code_challenge=c',
  'https://auth.openai.com:444/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&state=s&code_challenge=c',
  'https://auth.openai.com/oauth/authorize/?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&state=s&code_challenge=c',
  'https://auth.openai.com/codex/device?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&state=s&code_challenge=c',
  'https://auth.openai.com/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&code_challenge=c',
  'https://auth.openai.com/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&state=s',
  'https://auth.openai.com/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&state=a&state=b&code_challenge=c',
  'https://auth.openai.com/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&state=s&code_challenge=a&code_challenge=b',
  'https://auth.openai.com/oauth/authorize?redirect_uri=http%3A%2F%2Fevil.example%2Fauth%2Fcallback&state=s&code_challenge=c',
  'https://auth.openai.com/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost.evil.example%2Fauth%2Fcallback&state=s&code_challenge=c',
  'https://auth.openai.com/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fcallback&state=s&code_challenge=c',
  'https://auth.openai.com/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback%3Fx%3D1&state=s&code_challenge=c',
  'https://auth.openai.com/oauth/authorize?redirect_uri=http%3A%2F%2Fuser%3Apass%40localhost%3A1455%2Fauth%2Fcallback&state=s&code_challenge=c',
  'https://auth.openai.com/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&state=s&code_challenge=c#',
  ' https://auth.openai.com/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&state=s&code_challenge=c ',
  'javascript:alert(1)',
  '',
  null
 ])assert.equal(authorizationUrl(value),'','reject '+String(value));
});

test('粘贴回调只接受带 code/state 的 loopback /auth/callback，拒绝登录页和外站',()=>{
 assert.equal(callbackUrl(CALLBACK),CALLBACK);
 assert.equal(callbackUrl('http://127.0.0.1:1455/auth/callback?code=a&state=b'),'http://127.0.0.1:1455/auth/callback?code=a&state=b');
 assert.equal(callbackUrl('  '+CALLBACK+' '),CALLBACK);
 for(const value of [
  AUTH_URL,
  'https://auth.openai.com/callback?code=a&state=b',
  'http://evil.example/auth/callback?code=a&state=b',
  'http://localhost.evil.example/auth/callback?code=a&state=b',
  'http://user:pass@localhost:1455/auth/callback?code=a&state=b',
  'http://localhost:1455/other?code=a&state=b',
  'http://localhost:1455/auth/callback?code=a',
  'http://localhost:1455/auth/callback?state=b',
  'http://localhost:1455/auth/callback?code=&state=b',
  'http://localhost:1455/auth/callback?code=a&code=b&state=c',
  'http://localhost:1455/auth/callback?code=a&state=b&state=c',
  'http://localhost:1455/auth/callback?code=a&state=b#fragment',
  'http://localhost:1455/auth/callback?error=access_denied&state=b',
  'http://localhost:1455/auth/callback?code=a&state=b&error=access_denied',
  'http://localhost:1455/auth/callback?code=a%20b&state=b c',
  'javascript:alert(1)',
  '',
  null
 ])assert.equal(callbackUrl(value),'','reject '+String(value));
});

test('设备码只接受固定官方页面，备用入口不接收其他地址',()=>{
 assert.equal(verificationUrl('https://auth.openai.com/codex/device'),'https://auth.openai.com/codex/device');
 for(const value of [
  'http://auth.openai.com/codex/device',
  'https://auth.openai.com.evil.example/codex/device',
  'https://auth.openai.com@evil.example/codex/device',
  'https://auth.openai.com:444/codex/device',
  'https://auth.openai.com/codex/device/',
  'https://auth.openai.com/codex/device?user_code=ABC',
  'https://auth.openai.com/codex/device#code',
  'https://auth.openai.com/codex/other',
  '//auth.openai.com/codex/device',
  ' https://auth.openai.com/codex/device ',
  'javascript:alert(1)',
  '',
  null
 ])assert.equal(verificationUrl(value),'','reject '+String(value));
});

test('额度只读官方 primary/secondary 桶，缺失为未返回而不是 0',()=>{
 assert.deepEqual(quotaRows(null),[]);
 assert.deepEqual(quotaRows({}),[]);
 const rows=quotaRows({rateLimits:{primary:{usedPercent:25,windowMinutes:300,resetsAt:resetAt},secondary:null}});
 assert.equal(rows.length,2);
 assert.equal(rows[0].usedPercent,25);
 assert.equal(rows[0].usedText,'25%');
 assert.equal(rows[0].remaining,75);
 assert.equal(rows[0].remainingText,'75%');
 assert.equal(rows[0].windowText,'5 小时');
 assert.equal(rows[0].resetsText,expectedReset);
 assert.equal(rows[1].usedPercent,null);
 assert.equal(rows[1].usedText,'未返回');
 assert.equal(rows[1].remaining,null);
 assert.equal(rows[1].remainingText,'未返回');
 assert.equal(rows[1].windowText,'未返回');
 assert.equal(rows[1].resetsText,'未返回');
 const zero=quotaRows({rateLimits:{primary:{usedPercent:0,windowMinutes:0,resetsAt:0}}});
 assert.equal(zero[0].remainingText,'100%');
 assert.equal(zero[0].windowText,'0 分钟');
 assert.equal(zero[0].resetsText,'未返回');
});

test('多限额额度按官方 limit id 展开，仍只做 100-used 的剩余换算',()=>{
 const rows=quotaRows({
  rateLimits:{primary:{usedPercent:10,windowMinutes:60,resetsAt:resetAt}},
  rateLimitsByLimitId:{'gpt-6.1-sol':{primary:{usedPercent:50,windowMinutes:300,resetsAt:resetAt},secondary:{usedPercent:80,windowMinutes:10080,resetsAt:resetAt}}}
 });
 assert.equal(rows.length,2);
 assert.equal(rows[0].limitId,'gpt-6.1-sol');
 assert.equal(rows[0].remainingText,'50%');
 assert.equal(rows[1].windowText,'7 天');
 assert.equal(rows[1].remainingText,'20%');
});

test('秒级 resetsAt 与毫秒时间显示一致，空时间不显示 0',()=>{
 assert.notEqual(cloudTime(resetAt),'');
 assert.equal(cloudTime(resetAt),cloudTime(resetAt*1000));
 assert.equal(cloudTime('2026-10-21T09:00:00Z'),cloudTime(Date.parse('2026-10-21T09:00:00Z')));
 assert.equal(cloudTime(0),'');
 assert.equal(cloudTime(null),'');
 assert.equal(cloudTime(''),'');
});

test('账号名称、邮箱掩码与账号 ID 在渲染前转义',()=>{
 const identity=accountIdentity({
  label:'<img src=x onerror=alert(1)>',
  emailMasked:'a&b<svg onload=alert(1)>@example.com',
  id:'"><script>alert(1)</script>',
  planType:'<b>plus</b>'
 });
 for(const value of Object.values(identity))assert(!/[<>"]/.test(value),'must not contain raw markup: '+value);
 assert.match(identity.label,/&lt;img/);
 assert.match(identity.email,/&amp;b&lt;svg/);
 assert.match(identity.id,/&#39;&#39;|&quot;&gt;&lt;script/);
 assert.match(identity.plan,/&lt;b&gt;plus&lt;\/b&gt;/);
});

test('少量操作状态给出排队、进行、失败和唤醒结果，不把缺失额度当成 0',()=>{
 assert.match(operationStatusText({kind:'quota',status:'queued'}),/排队/);
 assert.match(operationStatusText({kind:'quota',status:'running'}),/正在读取/);
 assert.match(operationStatusText({kind:'quota',status:'ready',result:{quota:{}}}),/已刷新/);
 assert.match(operationStatusText({kind:'quota',status:'ready',result:{}}),/未返回额度/);
 assert.match(operationStatusText({kind:'wake',status:'ready',result:{probe:{passed:true,latencyMs:420},model:'gpt-6.1-sol',reasoningEffort:'deep',quota:{}}}),/手动唤醒通过.*420 ms.*gpt-6\.1-sol.*deep/);
 assert.match(operationStatusText({kind:'wake',status:'ready',result:{probe:{passed:false,latencyMs:120}}}),/未通过/);
 assert.match(operationStatusText({kind:'wake',status:'failed',error:'额度不足'}),/未完成.*额度不足/);
});

/* A deliberately small DOM harness for the real panel interactions: the test
   drives clicks, typing, submit and polling rather than matching source code. */
const savedGlobals={document:globalThis.document,localStorage:globalThis.localStorage};
class FakeClassList{
 constructor(){this.values=new Set();}
 add(...names){for(const name of names)this.values.add(name);}
 remove(...names){for(const name of names)this.values.delete(name);}
 toggle(name,force){const on=force===undefined?!this.values.has(name):!!force;if(on)this.add(name);else this.remove(name);return on;}
 contains(name){return this.values.has(name);}
}
const camel=name=>name.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
const matches=(node,selector)=>{
 if(!node)return false;
 if(selector.startsWith('#'))return node.id===selector.slice(1);
 if(selector.startsWith('.'))return node.classList.contains(selector.slice(1));
 const data=selector.match(/^\[data-([a-z0-9-]+)\]$/i);
 if(data)return node.attributes.has('data-'+data[1]);
 return node.tagName===String(selector).toUpperCase();
};
const findNode=(node,predicate)=>{
 for(const child of node.children){if(predicate(child))return child;const found=findNode(child,predicate);if(found)return found;}
 return null;
};
class FakeNode{
 constructor(tag='div'){
  this.tagName=String(tag).toUpperCase();this.children=[];this.parentNode=null;this.listeners={};
  this.attributes=new Map();this.dataset={};this.classList=new FakeClassList();
  this._html='';this._slot=null;this.hidden=false;this.disabled=false;this.noValidate=false;
  this.textContent='';this.value='';this.type='';this.id='';this.className='';
  this.selectionStart=0;this.selectionEnd=0;
 }
 setAttribute(name,value){
  const text=String(value);this.attributes.set(name,text);
  if(name==='id')this.id=text;
  if(name==='class')this.className=text;
  if(name==='type')this.type=text;
  if(name==='hidden')this.hidden=true;
  if(name.startsWith('data-'))this.dataset[camel(name.slice(5))]=text;
 }
 getAttribute(name){return this.attributes.has(name)?this.attributes.get(name):null;}
 removeAttribute(name){this.attributes.delete(name);if(name==='hidden')this.hidden=false;}
 set innerHTML(value){
  for(const child of this.children)child.parentNode=null;
  this._html=String(value);this.children=[];this._slot=null;
  if(this._html.includes('data-cloud-callback-slot')){
   const slot=new FakeNode('div');slot.parentNode=this;slot.setAttribute('data-cloud-callback-slot','');
   this.children.push(slot);this._slot=slot;
  }
 }
 get innerHTML(){return this._html;}
 appendChild(child){
  if(child.parentNode)child.parentNode.children=child.parentNode.children.filter(item=>item!==child);
  child.parentNode=this;this.children.push(child);return child;
 }
 remove(){
  if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(item=>item!==this);
  this.parentNode=null;
 }
 focus(){fakeDocument.activeElement=this;}
 setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
 get isConnected(){let node=this;while(node){if(node===fakeDocument.root)return true;node=node.parentNode;}return false;}
 querySelector(selector){
  if(selector==='[data-cloud-callback-slot]')return this._slot||findNode(this,node=>matches(node,selector));
  return findNode(this,node=>matches(node,selector));
 }
 closest(selector){let node=this;while(node){if(matches(node,selector))return node;node=node.parentNode;}return null;}
 addEventListener(type,listener){(this.listeners[type]??=[]).push(listener);}
 async emit(type,event={}){for(const listener of this.listeners[type]||[])await listener(event);}
}
let fakeDocument=null;
function installDom(){
 const root=new FakeNode('section');
 const ids=['cloud-accounts-status','cloud-account-list','cloud-auth-flow','cloud-op-state','cloud-account-add','cloud-account-refresh','cloud-device-fallback','cloud-device-start'];
 const nodes={};
 for(const id of ids){
  const node=new FakeNode(id.includes('add')||id.includes('refresh')||id.includes('start')?'button':'div');
  node.id=id;node.parentNode=root;nodes[id]=node;
 }
 const created=[];
 const body=new FakeNode('body');
 const doc={
  hidden:false,activeElement:null,body,root,created,listeners:{},
  createElement(tag){const node=new FakeNode(tag);created.push(node);return node;},
  addEventListener(type,listener){(this.listeners[type]??=[]).push(listener);},
  async emit(type,event={}){for(const listener of this.listeners[type]||[])await listener(event);}
 };
 fakeDocument=doc;
 root.querySelector=selector=>selector.startsWith('#')?nodes[selector.slice(1)]||null:findNode(root,node=>matches(node,selector));
 globalThis.document=doc;
 return {root,nodes,created,doc};
}
function installStorage(existing=new Map()){
 const map=existing,writes=[];
 globalThis.localStorage={
  getItem:key=>map.has(key)?map.get(key):null,
  setItem(key,value){map.set(key,String(value));writes.push([key,String(value)]);},
  removeItem(key){map.delete(key);writes.push([key,'']);}
 };
 return {map,writes};
}
function createHarness({accounts={enabled:true,accounts:[],activeId:null,revision:1},storageMap}={}){
 const dom=installDom(),storage=installStorage(storageMap),routes=new Map(),calls=[];
 const enqueue=(path,...items)=>{const queue=routes.get(path)||[];queue.push(...items);routes.set(path,queue);};
 const api=async(path,options={})=>{
  calls.push({path,options});
  const queue=routes.get(path)||[];
  if(!queue.length)throw new Error('unexpected request: '+path);
  const item=queue.shift();
  if(item instanceof Error)throw item;
  return typeof item==='function'?item(options):item;
 };
 enqueue('/admin/codex/accounts',accounts);
 let authRequired=0;
 const panel=createCloudAccountPanel({
  root:dom.root,api,requests:createRequestScope(),session:()=>true,wakeDefaults:()=>null,
  onAuthRequired:()=>{authRequired++;}
 });
 return {
  dom,storage,calls,enqueue,panel,
  get authRequired(){return authRequired;},
  form(){return dom.created.filter(node=>node.tagName==='FORM').at(-1)||null;},
  input(){return this.form()?.querySelector('input')||null;},
  error(){return this.form()?.querySelector('[data-cloud-callback-error]')||null;},
  flow(){return dom.nodes['cloud-auth-flow'].innerHTML;},
  status(){return dom.nodes['cloud-accounts-status'].textContent;},
  async click(selector){return dom.root.emit('click',{target:{closest:value=>value===selector?{}:null}});},
  cleanup(){
   panel.forget();
   if(savedGlobals.document===undefined)delete globalThis.document;else globalThis.document=savedGlobals.document;
   if(savedGlobals.localStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=savedGlobals.localStorage;
   fakeDocument=null;
  }
 };
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('添加账号默认浏览器 OAuth，等待页给出打开、粘贴、保存三步且不显示设备码',async()=>{
 const h=createHarness();
 try{
  await h.panel.load();
  assert.equal(h.dom.nodes['cloud-device-fallback'].hidden,false);
  h.enqueue('/admin/codex/authorize',{id:ATTEMPT,status:'waiting',flow:'browser',authorizationUrl:AUTH_URL,expiresAt:Date.now()+600000});
  await h.panel.begin('add');
  const body=h.calls.find(call=>call.path==='/admin/codex/authorize').options.body;
  assert.deepEqual(body,{mode:'add',flow:'browser'});
  const html=h.flow();
  assert.match(html,/打开官方登录页面/);
  assert.match(html,/粘贴返回链接/);
  assert.match(html,/云端确认并保存账号/);
  assert.match(html,/auth\.openai\.com\/oauth\/authorize/);
  assert(!html.includes('设备码'),'browser flow must not show device wording');
  assert.equal(h.dom.nodes['cloud-device-fallback'].hidden,true,'fallback yields to the waiting flow');
  const input=h.input();
  assert.equal(input.type,'url');
  assert.equal(input.getAttribute('autocomplete'),'off');
  assert.equal(input.getAttribute('spellcheck'),'false');
  assert.equal(input.getAttribute('inputmode'),'url');
  assert.deepEqual([...h.storage.map.keys()],[CLOUD_AUTH_STORAGE]);
  assert.equal(h.storage.map.get(CLOUD_AUTH_STORAGE),ATTEMPT);
  assert(!h.storage.writes.some(([,value])=>value.includes('auth.openai.com')||value.includes('/auth/callback')));
 }finally{h.cleanup();}
});

test('轮询重绘保留未提交链接与焦点；提交后立即清空，只有真实轮询完成才显示成功',async()=>{
 const h=createHarness();
 try{
  await h.panel.load();
  h.enqueue('/admin/codex/authorize',{id:ATTEMPT,status:'waiting',flow:'browser',authorizationUrl:AUTH_URL,expiresAt:Date.now()+600000});
  await h.panel.begin('add');
  const input=h.input();
  input.value=CALLBACK;input.focus();input.setSelectionRange(12,28);
  h.enqueue('/admin/codex/authorize/'+ATTEMPT,{id:ATTEMPT,status:'waiting',flow:'browser',authorizationUrl:AUTH_URL,expiresAt:Date.now()+900000});
  await wait(700);
  assert.equal(input.value,CALLBACK,'polling must not clear an unsubmitted callback');
  assert.equal(fakeDocument.activeElement,input,'polling must keep input focus');
  assert.equal(input.selectionStart,12);

  let release=null;const gate=new Promise(resolve=>{release=resolve;});
  h.enqueue('/admin/codex/authorize/'+ATTEMPT+'/callback',async()=>{await gate;return {status:'accepted'};});
  const submitting=h.form().emit('submit',{preventDefault(){}});
  await wait(0);
  assert.equal(input.value,'','callback is cleared immediately after submit');
  const posted=h.calls.find(call=>call.path.endsWith('/callback'));
  assert.deepEqual(posted.options.body,{callbackUrl:CALLBACK});
  assert(!h.flow().includes('官方账号已更新'),'202 alone must not be reported as success');
  release();
  await submitting;
  assert.match(h.status(),/回调已提交/);
  assert(!h.flow().includes('官方账号已更新'),'accepted callback is not completion');
  await h.click('[data-cloud-callback-edit]');
  assert.equal(h.input().disabled,false,'retry becomes available after accepted-but-unconfirmed');
  assert.equal(h.form().querySelector('[data-cloud-callback-submit]').disabled,false);

  h.enqueue('/admin/codex/authorize/'+ATTEMPT,{status:'complete',accountId:'acct-1',expiresAt:Date.now()+900000});
  h.enqueue('/admin/codex/accounts',{enabled:true,accounts:[{id:'acct-1',label:'测试账号',emailMasked:'t***@example.com',planType:'plus',active:true}],activeId:'acct-1',revision:2});
  await wait(40);
  assert.match(h.flow(),/官方账号已更新/);
  assert.match(h.status(),/官方授权已完成/);
  assert.equal(input.value,'');
  assert(!h.storage.writes.some(([,value])=>value.includes(CALLBACK)));
 }finally{h.cleanup();}
});

test('无效链接不提交且保留文字；409 给出可重试反馈，重复提交只发送一次',async()=>{
 const h=createHarness();
 try{
  await h.panel.load();
  h.enqueue('/admin/codex/authorize',{id:ATTEMPT,status:'waiting',flow:'browser',authorizationUrl:AUTH_URL,expiresAt:Date.now()+600000});
  await h.panel.begin('add');
  const input=h.input();
  input.value=AUTH_URL;
  await h.form().emit('submit',{preventDefault(){}});
  assert.equal(input.value,AUTH_URL,'invalid text is kept for correction');
  assert.equal(h.calls.filter(call=>call.path.endsWith('/callback')).length,0);
  assert.match(h.error().textContent,/完整回调链接/);

  input.value=CALLBACK;
  let release=null;const gate=new Promise(resolve=>{release=resolve;});
  h.enqueue('/admin/codex/authorize/'+ATTEMPT+'/callback',async()=>{await gate;throw Object.assign(new Error('conflict'),{status:409,code:'CODEX_AUTHORIZATION_CONFLICT'});});
  const first=h.form().emit('submit',{preventDefault(){}});
  await wait(0);
  const second=h.form().emit('submit',{preventDefault(){}});
  release();
  await Promise.all([first,second]);
  assert.equal(h.calls.filter(call=>call.path.endsWith('/callback')).length,1,'duplicate submit is ignored while in flight');
  assert.equal(input.value,'','submitted callback is cleared before the server result');
  assert.match(h.error().textContent,/完整链接/);
  assert.match(h.error().textContent,/重复提交|重试/);
  assert.equal(input.disabled,false,'retry is available after failure');
  assert(!h.flow().includes('官方账号已更新'));
 }finally{h.cleanup();}
});

test('401 保留未提交回调文字，重新验证后继续同一授权',async()=>{
 const h=createHarness();
 try{
  await h.panel.load();
  h.enqueue('/admin/codex/authorize',{id:ATTEMPT,status:'waiting',flow:'browser',authorizationUrl:AUTH_URL,expiresAt:Date.now()+600000});
  await h.panel.begin('add');
  const input=h.input();
  input.value=CALLBACK;
  h.enqueue('/admin/codex/authorize/'+ATTEMPT+'/callback',Object.assign(new Error('expired'),{status:401,code:'AUTH_REQUIRED'}));
  await h.form().emit('submit',{preventDefault(){}});
  assert.equal(h.authRequired,1);
  assert.match(h.flow(),/教师验证已过期/);
  assert.equal(input.value,CALLBACK,'session expiry must not erase the pasted callback');
  assert.equal(input.isConnected,false,'auth state stays compact without the form');

  h.enqueue('/admin/codex/accounts',{enabled:true,accounts:[],activeId:null,revision:1});
  h.enqueue('/admin/codex/authorize/'+ATTEMPT,{id:ATTEMPT,status:'waiting',flow:'browser',authorizationUrl:AUTH_URL,expiresAt:Date.now()+600000});
  await h.panel.load();
  await wait(40);
  assert.match(h.flow(),/打开官方登录页面/);
  assert.equal(h.input(),input,'the same input is restored');
  assert.equal(input.value,CALLBACK);
  assert.equal(input.isConnected,true);
  assert.equal(h.storage.map.get(CLOUD_AUTH_STORAGE),ATTEMPT);
 }finally{h.cleanup();}
});

test('刷新后只凭授权编号恢复浏览器等待页，不恢复或记录链接',async()=>{
 const first=createHarness();
 let store;
 try{
  await first.panel.load();
  first.enqueue('/admin/codex/authorize',{id:ATTEMPT,status:'waiting',flow:'browser',authorizationUrl:AUTH_URL,expiresAt:Date.now()+600000});
  await first.panel.begin('add');
  store=first.storage.map;
 }finally{first.cleanup();}

 const second=createHarness({storageMap:store});
 try{
  second.enqueue('/admin/codex/authorize/'+ATTEMPT,{id:ATTEMPT,status:'waiting',flow:'browser',authorizationUrl:AUTH_URL,expiresAt:Date.now()+600000});
  await second.panel.load();
  await wait(40);
  assert.equal(second.storage.map.get(CLOUD_AUTH_STORAGE),ATTEMPT);
  assert.deepEqual([...second.storage.map.keys()],[CLOUD_AUTH_STORAGE]);
  assert.match(second.flow(),/打开官方登录页面/);
  assert(!second.flow().includes('设备码'));
  assert.equal(second.input().value,'');
  assert(!second.storage.writes.some(([,value])=>value.includes('auth.openai.com')||value.includes('/auth/callback')));
 }finally{second.cleanup();}
});

test('取消清空未提交回调与授权编号，设备码仅在起始备用入口使用',async()=>{
 const h=createHarness();
 try{
  await h.panel.load();
  assert.equal(h.dom.nodes['cloud-device-fallback'].hidden,false);
  h.enqueue('/admin/codex/authorize',{id:ATTEMPT,status:'waiting',flow:'browser',authorizationUrl:AUTH_URL,expiresAt:Date.now()+600000});
  await h.panel.begin('add');
  const input=h.input();
  input.value=CALLBACK;
  h.enqueue('/admin/codex/authorize/'+ATTEMPT+'/cancel',{status:'cancelled'});
  await h.click('[data-cloud-cancel]');
  assert.match(h.flow(),/已停止本次授权/);
  assert.equal(input.value,'','cancel clears the pasted callback');
  assert.equal(h.storage.map.size,0,'cancel clears the persisted attempt id');
  assert.match(h.status(),/已取消/);
  await h.click('[data-cloud-dismiss]');
  assert.equal(h.dom.nodes['cloud-account-add'].disabled,false,'closing a finished flow restores the add-account action');
  assert.equal(h.dom.nodes['cloud-device-fallback'].hidden,false);
 }finally{h.cleanup();}

 const d=createHarness();
 try{
  await d.panel.load();
  d.enqueue('/admin/codex/authorize',{id:ATTEMPT,status:'waiting',flow:'device',verificationUrl:'https://auth.openai.com/codex/device',userCode:'ABCD-EFGH',expiresAt:Date.now()+600000});
  await d.click('#cloud-device-start');
  const body=d.calls.find(call=>call.path==='/admin/codex/authorize').options.body;
  assert.deepEqual(body,{mode:'add',flow:'device'});
  assert.match(d.flow(),/设备码/);
  assert.match(d.flow(),/ABCD-EFGH/);
  assert.match(d.flow(),/codex\/device/);
  assert.equal(d.input(),null,'device fallback has no callback paste form');
  assert.equal(d.dom.nodes['cloud-device-fallback'].hidden,true);
 }finally{d.cleanup();}
});
