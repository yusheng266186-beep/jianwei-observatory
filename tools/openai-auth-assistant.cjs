'use strict';
// Keyless loopback companion. OAuth credentials and PKCE stay in the private
// service; this process only forwards a short-lived handoff and callback code.
const http=require('node:http'),crypto=require('node:crypto');
const SERVICE='https://1459223409-4t5ckc9dro.ap-chengdu.tencentscf.com';
const WORKBENCH='https://yusheng266186-beep.github.io/jianwei-observatory/model-workbench.html';
const idPattern=/^[a-f0-9-]{36}$/i,ticketPattern=/^[A-Za-z0-9_-]{40,128}$/;
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
async function backendRequest(route,body){
 const response=await fetch(SERVICE+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(55000),redirect:'error'});
 let data;try{data=await response.json();}catch{throw Error('SERVICE_UNAVAILABLE');}
 if(!response.ok)throw Object.assign(Error('AUTHORIZATION_REQUEST_FAILED'),{code:data.error,status:response.status});
 return data;
}
function createAssistant({request=backendRequest,now=Date.now}={}){
 const attempts=new Map();let origin;
 const server=http.createServer(async(req,res)=>{
  const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Cross-Origin-Opener-Policy':'same-origin'};
  const json=(status,value)=>{res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  const page=()=>{const nonce=crypto.randomBytes(18).toString('base64');res.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-"+nonce+"'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"});res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ChatGPT 授权 · 荣县一中</title><style>html{color-scheme:light}*{box-sizing:border-box}body{margin:0;padding:clamp(24px,8vw,80px);min-height:100vh;background:radial-gradient(at 95% 5%,#d9eaf1,transparent 65%),#f2f7f9;color:#234a66;font:16px/1.8 system-ui}main{max-width:690px;margin:6vh auto;padding:clamp(24px,5vw,45px);border:1px solid #fff;border-radius:28px;background:#ffffffb8;box-shadow:0 24px 80px -40px #325c7f66;backdrop-filter:blur(22px)}small{letter-spacing:.12em;color:#63849b}h1{font-size:clamp(24px,4vw,32px);line-height:1.4}p{overflow-wrap:anywhere}a{display:inline-block;padding:10px 17px;border-radius:13px;background:#2b5d7d;color:#fff;text-decoration:none;margin-top:15px}a[hidden]{display:none}.note{font-size:13px;color:#628196}</style><main><small>荣县一中 / 官方账号</small><h1 id="title">授权助手已就绪</h1><p id="status">请从模型工作台选择添加账号、重新授权或切换账号。</p><a id="continue" hidden>Continue with ChatGPT ↗</a><p class="note">账号登录与权限确认在 OpenAI 官方页面完成。本机助手不保存账号密码或令牌。</p><a href="${WORKBENCH}">返回模型工作台 ↗</a></main><script nonce="${nonce}">
const params=new URLSearchParams(location.hash.slice(1)),view=new URLSearchParams(location.search),status=document.getElementById('status'),title=document.getElementById('title'),next=document.getElementById('continue');history.replaceState(null,'',location.pathname+location.search);let timer;
async function poll(id){try{const r=await fetch('/status?id='+encodeURIComponent(id)),v=await r.json();title.textContent=v.title;status.textContent=v.message;if(v.pending)timer=setTimeout(()=>poll(id),1800);}catch{status.textContent='连接暂时中断，请返回工作台同步授权结果。';}}
async function launch(){try{title.textContent='正在准备官方授权';status.textContent='当前可用账号会一直保留到新授权验证成功。';const r=await fetch('/launch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:params.get('id'),ticket:params.get('ticket')})}),v=await r.json();if(!r.ok)throw Error();params.delete('ticket');if(v.status&&v.status!=='waiting'){poll(params.get('id'));return;}next.href=v.continueUrl;next.hidden=false;title.textContent='继续官方授权';status.textContent='点击下方按钮，前往 OpenAI 官方页面完成账号选择与权限确认。';}catch{title.textContent='授权入口已过期或暂未接通';status.textContent='当前账号未更改。请返回模型工作台，重新发起授权。';}}
if(params.has('id')&&params.has('ticket'))launch();else if(view.has('id'))poll(view.get('id'));
</script></html>`);};
  try{
   origin='http://127.0.0.1:'+server.address().port;
   if(req.headers.host!=='127.0.0.1:'+server.address().port)return json(403,{error:'HOST_REJECTED'});
   const url=new URL(req.url,origin);
   for(const [id,attempt]of attempts)if(attempt.expiresAt<=now())attempts.delete(id);
   if(req.method==='GET'&&url.pathname==='/health')return json(200,{application:'Jianwei Observatory Authorization Assistant',ready:true});
   if(req.method==='GET'&&['/','/result'].includes(url.pathname))return page();
   if(req.method==='POST'&&url.pathname==='/launch'){
    if(req.headers.origin!==origin||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return json(403,{error:'ORIGIN_REJECTED'});
    let raw='',bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>16384)return json(413,{error:'REQUEST_TOO_LARGE'});raw+=chunk;}
    const data=JSON.parse(raw);if(!idPattern.test(data.id||'')||!ticketPattern.test(data.ticket||'')||Object.keys(data).some(key=>!['id','ticket'].includes(key)))return json(400,{error:'INVALID_HANDOFF'});
    let attempt=attempts.get(data.id);if(attempt&&!equal(attempt.ticket,data.ticket))return json(409,{error:'HANDOFF_CONFLICT'});
    if(!attempt){
     const claimed=await request('/openai/authorization/claim',{id:data.id,ticket:data.ticket,redirectUri:origin+'/auth/callback'}),target=new URL(claimed.authorizationUrl),expiresAt=typeof claimed.expiresAt==='number'?claimed.expiresAt:Date.parse(claimed.expiresAt);
     if(target.origin!=='https://auth.openai.com'||target.pathname!=='/api/accounts/authorize'||target.searchParams.get('redirect_uri')!==origin+'/auth/callback'||!ticketPattern.test(target.searchParams.get('state')||'')||!Number.isFinite(expiresAt)||expiresAt<=now())throw Error('INVALID_AUTHORIZATION_DESTINATION');
     if(attempts.size>=8)return json(429,{error:'TOO_MANY_ATTEMPTS'});
     attempt={id:data.id,ticket:data.ticket,state:target.searchParams.get('state'),authorizationUrl:target.href,expiresAt,status:'waiting'};attempts.set(data.id,attempt);
    }
    return json(200,{continueUrl:'/continue?id='+encodeURIComponent(data.id),expiresAt:attempt.expiresAt,status:attempt.status});
   }
   if(req.method==='GET'&&url.pathname==='/continue'){
    const attempt=attempts.get(url.searchParams.get('id'));if(!attempt||attempt.status!=='waiting')return json(410,{error:'AUTHORIZATION_EXPIRED'});
    res.writeHead(302,{...headers,Location:attempt.authorizationUrl});return res.end();
   }
   if(req.method==='GET'&&url.pathname==='/auth/callback'){
    const state=url.searchParams.get('state'),attempt=[...attempts.values()].find(value=>equal(value.state,state));
    if(!attempt||attempt.status!=='waiting')return json(400,{error:'CALLBACK_REJECTED'});
    const code=url.searchParams.get('code'),clientId=url.searchParams.get('client_id'),declined=url.searchParams.get('error');
    if(!declined&&(!code||code.length>8192)||clientId&&!/^oaiapp_[A-Za-z0-9_-]{1,480}$/.test(clientId))return json(400,{error:'CALLBACK_REJECTED'});
    attempt.status='exchanging';attempt.authorizationUrl='';
    request('/openai/authorization/complete',{id:attempt.id,ticket:attempt.ticket,state,...(declined?{error:'access_denied'}:{code}),...(clientId?{clientId}:{})}).then(result=>{attempt.status=['complete','failed','cancelled','expired'].includes(result.status)?result.status:'uncertain';},()=>{attempt.status='uncertain';}).finally(()=>{attempt.ticket='';attempt.state='';});
    res.writeHead(303,{...headers,Location:'/result?id='+encodeURIComponent(attempt.id)});return res.end();
   }
   if(req.method==='GET'&&url.pathname==='/status'){
    const attempt=attempts.get(url.searchParams.get('id')),status=attempt?.status||'expired';
    const texts={waiting:['等待官方授权','请继续 OpenAI 官方页面的账号选择与权限确认。'],exchanging:['正在验证账号','云端正在验证本次授权，完成后工作台会显示新的当前账号。'],complete:['官方授权已完成','账号已通过验证，请返回模型工作台查看。'],cancelled:['本次授权已取消','原账号保持不变。请返回模型工作台。'],failed:['本次授权未完成','原账号保持不变。请返回工作台查看原因或重新发起。'],uncertain:['请返回工作台同步结果','请求已发往云端。请在模型工作台同步授权状态，避免重复提交。'],expired:['授权入口已过期','原账号保持不变。请从模型工作台重新发起。']};
    return json(200,{status,title:texts[status][0],message:texts[status][1],pending:status==='exchanging'});
   }
   return json(404,{error:'NOT_FOUND'});
  }catch{return json(503,{error:'AUTHORIZATION_UNAVAILABLE'});}
 });
 server.on('close',()=>attempts.clear());return server;
}
if(require.main===module){const server=createAssistant();server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'授权助手已经启动；请返回模型工作台继续。':'授权助手暂未启动，请重试。');process.exitCode=1;});server.listen(24765,'127.0.0.1',()=>console.log('授权助手已启动。请保留此窗口，并从模型工作台发起授权。'));process.on('SIGINT',()=>server.close());process.on('SIGTERM',()=>server.close());}
module.exports={createAssistant};
