// Read-only demo API for tests/fixtures/model-workbench-demo.html.
// Every value is fictional. No OAuth token, cookie or real account is present.
(()=>{
 const endpoint='https://1459223409-4t5ckc9dro.ap-chengdu.tencentscf.com';
 const id=key=>key.repeat(64);
 const efforts={low:'low',medium:'medium',high:'high',xhigh:'xhigh',max:'max',ultra:'ultra'};
 const providers=[
  {id:'openai-chatgpt',label:'ChatGPT 官方',defaultModel:'gpt-5.4',protocol:'siwc',configured:true,models:[
   {id:'gpt-5.4',name:'GPT-5.4',efforts,note:'官方账号直连；思考强度越高越慢。'},
   {id:'gpt-5.4-mini',name:'GPT-5.4 mini',efforts,note:''},
   {id:'gpt-5.3-codex',name:'GPT-5.3 Codex',efforts,note:''}]},
  {id:'gemini',label:'ByteCat · Gemini',defaultModel:'gemini-3.8-flash',protocol:'gemini',configured:true,models:[
   {id:'gemini-3.8-flash',name:'Gemini 3.8 Flash',efforts:{deep:'high'},note:'演示模型',performance:{tps:112.4,observedAt:'2026-10-18',groups:[{name:'默认',tps:120},{name:'高负载',tps:88}]}}]},
  {id:'kimi-code',label:'Kimi 官方 · 个人会员',defaultModel:'k3',protocol:'kimi',configured:true,models:[{id:'k3',name:'Kimi K3',efforts:{deep:'max'},note:''}]},
  {id:'deepseek',label:'DeepSeek',defaultModel:'deepseek-v4',protocol:'openai',configured:false,models:[{id:'deepseek-v4',name:'DeepSeek V4',efforts:{eco:'low',standard:'medium',deep:'high'},note:''}]}
 ];
 const selection={provider:'gemini',model:'gemini-3.8-flash',effort:'deep'};
 const state={current:{revision:12,selection,diagramSelection:{provider:'openai-chatgpt',model:'gpt-5.4',effort:'medium'},repairSelection:null,repairAttempts:1,imageSelection:{provider:'bytecat-image',model:'gpt-image-2'},updatedAt:Date.parse('2026-10-21T09:00:00Z')},
  history:[
   {revision:12,role:'exercise',selection,diagramSelection:{provider:'openai-chatgpt',model:'gpt-5.4',effort:'medium'},repairAttempts:1,updatedAt:Date.parse('2026-10-21T09:00:00Z')},
   {revision:11,role:'diagram',selection,diagramSelection:null,repairAttempts:1,updatedAt:Date.parse('2026-10-20T10:00:00Z')},
   {revision:10,role:'exercise',selection:{provider:'kimi-code',model:'k3',effort:'deep'},repairAttempts:0,updatedAt:Date.parse('2026-10-19T08:00:00Z')}],
  checks:[{provider:'gemini',model:'gemini-3.8-flash',effort:'deep',status:'passed',latencyMs:2100,checkedAt:Date.now()-3600000}],
  providers,
  image:{model:'GPT Image 2',label:'复杂配图',selection:{provider:'bytecat-image',model:'gpt-image-2'},providers:[{id:'bytecat-image',label:'ByteCat · 生图',name:'GPT Image 2',model:'gpt-image-2',configured:true},{id:'cheetah-image',label:'猎豹 · 生图',name:'GPT Image 1.5',model:'gpt-image-1.5',configured:false}],mode:'图示模型按策略选择，常见模型优先SVG'}};
 let active=id('a'),extra=false,pending=null,polls=0,mode='complete';
 const rows=()=>[
  {id:id('a'),label:'张老师',emailMasked:'z***@example.edu.cn',status:active===id('a')?'active':'saved',active:active===id('a'),authorizedAt:Date.parse('2026-10-01T08:00:00Z'),accessExpiresAt:Date.now()+86400000},
  {id:id('b'),label:'备课组',emailMasked:'b***@example.edu.cn',status:active===id('b')?'active':'saved',active:active===id('b'),authorizedAt:Date.parse('2026-09-20T08:00:00Z'),accessExpiresAt:Date.now()-3600000},
  {id:id('c'),label:'旧账号',emailMasked:'o***@example.edu.cn',status:active===id('c')?'active':'reauthorize',active:active===id('c'),authorizedAt:Date.parse('2026-08-20T08:00:00Z'),accessExpiresAt:null},
  ...(extra?[{id:id('d'),label:'新账号（演示）',emailMasked:'n***@example.edu.cn',status:active===id('d')?'active':'saved',active:active===id('d'),authorizedAt:Date.now(),accessExpiresAt:Date.now()+3600000}]:[])
 ];
 const json=(body,status=200)=>Promise.resolve(new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}}));
 const real=window.fetch.bind(window);
 window.fetch=(input,init={})=>{
  const raw=typeof input==='string'?input:input.url;
  if(!raw.startsWith(endpoint))return real(input,init);
  const url=new URL(raw,location.href);
  const path=url.pathname,method=(init.method||'GET').toUpperCase();
  if(path==='/admin/models'&&method==='GET')return json(state);
  if(path==='/admin/usage'&&method==='GET')return json({revision:3,used:4,limit:30,remaining:26});
  if(path==='/admin/diagnostics')return json({asOf:new Date().toISOString(),days:7,totals:{jobs:5,ready:4,failed:1},jobs:[]});
  if(path==='/admin/openai/accounts')return json({enabled:true,activeId:active,accounts:rows(),helper:{origin:'http://127.0.0.1:24765',download:'./tools/openai-auth-assistant.cjs'}});
  if(path==='/admin/openai/authorize'&&method==='POST'){
   let body={};try{body=JSON.parse(init.body||'{}');}catch{}
   pending=body.mode==='add'?id('d'):body.accountId||active;polls=0;
   return json({id:'11111111-1111-4111-8111-111111111111',expiresAt:Date.now()+900000,launchUrl:'http://127.0.0.1:24765/#id=11111111-1111-4111-8111-111111111111&ticket=demo-ticket'});
  }
  if(path==='/admin/openai/authorize/11111111-1111-4111-8111-111111111111'&&method==='GET'){
   polls++;
   if(polls<2)return json({id:'11111111-1111-4111-8111-111111111111',status:'waiting',expiresAt:Date.now()+900000});
   if(mode==='failed')return json({id:'11111111-1111-4111-8111-111111111111',status:'failed',error:'OPENAI_AUTHORIZATION_IDENTITY_INVALID',expiresAt:Date.now()+900000});
   if(polls<3)return json({id:'11111111-1111-4111-8111-111111111111',status:'exchanging',expiresAt:Date.now()+900000});
   if(pending===id('d'))extra=true;
   if(pending)active=pending;
   return json({id:'11111111-1111-4111-8111-111111111111',status:'complete',expiresAt:Date.now()+900000});
  }
  if(path.endsWith('/cancel')&&method==='POST')return json({id:'11111111-1111-4111-8111-111111111111',status:'cancelled',expiresAt:Date.now()+900000});
  return json({error:'DEMO_ROUTE_NOT_IMPLEMENTED'},404);
 };
 try{sessionStorage.setItem('jianwei-model-workbench-session',JSON.stringify({token:'demo-session',expires:Date.now()+3600000}));}catch{}
 const query=new URLSearchParams(location.search);
 if(query.get('auth')==='failed')mode='failed';
 if(query.get('auth')==='cancelled')mode='cancelled';
})();
