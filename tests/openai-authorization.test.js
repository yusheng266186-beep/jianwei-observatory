import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import stores from '../backend/store.cjs';
import serverModule from '../backend/server.cjs';
import totp from '../backend/totp.cjs';
import credentials from '../backend/openai-credentials.cjs';
import authorization from '../backend/openai-authorization.cjs';

const {MemoryStore}=stores,{createServer}=serverModule,{createAuthorizationControl}=authorization;
const ISSUER='https://auth.openai.com',JWKS=ISSUER+'/.well-known/jwks.json',TOKEN=ISSUER+'/api/accounts/oauth/token',REDIRECT='http://127.0.0.1:24765/auth/callback',SCOPE='openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const seed=totp.encodeSecret(Buffer.from('12345678901234567890'));
const env={TRAINING_SESSION_SECRET:'authorization-test-session-secret-'+crypto.randomBytes(16).toString('hex'),TRAINING_TOTP_SECRET:seed,TRAINING_ORIGINS:'https://school.test',TRAINING_DAILY_LIMIT:'50',OPENAI_SIWC_ENABLED:'true'};
const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'authorization-test-key',use:'sig',alg:'RS256'};

function clockAt(start=Date.now()){let value=start;return {now:()=>value,advance:ms=>{value+=ms;},get value(){return value;}};}
function tokenFor({sub,aud,nonce,email='new@example.com',exp=Math.floor(Date.now()/1000)+3600}){
 const header=Buffer.from(JSON.stringify({alg:'RS256',kid:jwk.kid})).toString('base64url');
 const claims=Buffer.from(JSON.stringify({iss:ISSUER,sub,aud,nonce,email,exp,iat:Math.floor(Date.now()/1000)})).toString('base64url');
 return header+'.'+claims+'.'+crypto.sign('sha256',Buffer.from(header+'.'+claims),privateKey).toString('base64url');
}
function fakeNetwork({token,keys=jwk,delay=0}={}){
 let tokenCalls=0,jwksCalls=0;
 const fake={onToken:token||(()=>({status:200,body:'{}'}))};
 const network=async run=>run(async(url,options)=>{
  if(url===JWKS){jwksCalls++;const value=typeof keys==='function'?keys():keys;if(!value)return {status:503,body:'{}'};return {status:200,body:JSON.stringify({keys:Array.isArray(value)?value:[value]})};}
  if(url===TOKEN){tokenCalls++;if(delay)await new Promise(resolve=>setTimeout(resolve,delay));return fake.onToken(new URLSearchParams(options.body),options);}
  throw Error('UNEXPECTED_DESTINATION');
 });
 return {network,fake,get tokenCalls(){return tokenCalls;},get jwksCalls(){return jwksCalls;}};
}
function activeCredential(clock){
 return {application:'Jianwei Observatory',issuer:ISSUER,subject:'old-subject',client_id:'oaiapp_old',ext_agent_host_id:'urn:uuid:00000000-0000-4000-8000-000000000001',access_token:'old-access-private',refresh_token:'old-refresh-private',id_token:'old-id-token-private',scopes:['resource.invoke','chatgpt.tokens.use.direct','offline_access'],expires_at:clock.now()+3600000,email:'old@example.com',saved_at:new Date(clock.now()).toISOString()};
}
async function seedActive(store,clock,overrides={}){
 const value={...activeCredential(clock),...overrides};
 await store.create(credentials.versionKey(1),{revision:1,credentials:value});return value;
}
async function startService({store=new MemoryStore(),clock=clockAt(),control,envOverride={}}={}){
 const app=createServer({store,env:{...env,...envOverride},now:clock.now,authorizationControl:control});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.address().port;
 const code=totp.codeForCounter(seed,Math.floor(clock.now()/30000));
 const session=await fetch(base+'/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});
 const token=(await session.json()).token;
 const call=(path,{method='GET',body}={})=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const capability=(path,body)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 return {app,base,token,call,capability};
}
function ticketFrom(launchUrl){return new URLSearchParams(launchUrl.slice(launchUrl.indexOf('#')+1)).get('ticket');}
async function claim(service,id,ticket,redirectUri=REDIRECT){
 const response=await service.capability('/openai/authorization/claim',{id,ticket,redirectUri});
 return {status:response.status,data:await response.json()};
}
async function complete(service,{id,ticket,state,code='authorization-code-1',clientId,error}){
 const response=await service.capability('/openai/authorization/complete',{id,ticket,state,...(error?{error}:{code}),...(clientId?{clientId}:{})});
 return {status:response.status,data:await response.json()};
}
async function authorizeAdd(service){
 const response=await service.call('/admin/openai/authorize',{method:'POST',body:{mode:'add'}});
 const data=await response.json();
 return {status:response.status,data,ticket:ticketFrom(data.launchUrl||'#')};
}
async function newAccountFlow({service,network,sub='new-subject',clientId='oaiapp_new',email='new@example.com',scope=SCOPE}){
 const add=await authorizeAdd(service);
 const claimed=await claim(service,add.data.id,add.ticket);
 assert.equal(claimed.status,200);
 const url=new URL(claimed.data.authorizationUrl);
 network.fake.onToken=form=>({status:200,body:JSON.stringify({access_token:'new-access-private',refresh_token:'new-refresh-private',id_token:tokenFor({sub,aud:form.get('client_id'),nonce:url.searchParams.get('nonce'),email}),expires_in:3600,scope,token_type:'Bearer'})});
 const done=await complete(service,{id:add.data.id,ticket:add.ticket,state:url.searchParams.get('state'),clientId});
 return {add,claimed,url,done};
}

test('账号列表受TOTP保护，旧活动凭据自动显示且不泄露令牌、sub或client_id',async()=>{
 const store=new MemoryStore(),clock=clockAt();
 await seedActive(store,clock);
 const service=await startService({store,clock,control:createAuthorizationControl({store,env,now:clock.now})});
 try{
  assert.equal((await fetch(service.base+'/admin/openai/accounts')).status,401);
  assert.equal((await fetch(service.base+'/admin/openai/authorize',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  assert.equal((await fetch(service.base+'/admin/openai/authorize/'+crypto.randomUUID())).status,401);
  assert.equal((await fetch(service.base+'/admin/openai/authorize/'+crypto.randomUUID()+'/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  const response=await service.call('/admin/openai/accounts'),data=await response.json();
  assert.equal(response.status,200);
  assert.equal(data.enabled,true);
  assert.equal(data.automaticRefresh,true);
  assert.deepEqual(data.helper,{origin:'http://127.0.0.1:24765',download:'./tools/openai-auth-assistant.cjs',launcherDownload:'./assets/downloads/jianwei-auth-helper-macos.zip'});
  assert.equal(data.accounts.length,1);
  const account=data.accounts[0];
  assert.equal(account.status,'active');assert.equal(account.active,true);assert.equal(account.id,data.activeId);
  assert.equal(account.emailMasked,'o***@example.com');assert.equal(account.accessExpiresAt,clock.now()+3600000);
  assert.equal(account.authorizedAt,clock.now());
  const text=JSON.stringify(data);
  for(const secret of ['old-access-private','old-refresh-private','old-id-token-private','old-subject','oaiapp_old','old@example.com','token'])assert(!text.includes(secret),secret);
 }finally{await new Promise(resolve=>service.app.close(resolve));}
});

test('没有旧账号时首次添加生成稳定主机ID并写入凭据版本1',async()=>{
 const store=new MemoryStore(),clock=clockAt();
 const fake=fakeNetwork({token:()=>({status:200,body:'{}'})});
 const control=createAuthorizationControl({store,now:clock.now,network:fake.network});
 const service=await startService({store,clock,control});
 try{
  const add=await authorizeAdd(service),claimed=await claim(service,add.data.id,add.ticket),url=new URL(claimed.data.authorizationUrl),nonce=url.searchParams.get('nonce');
  assert.match(url.searchParams.get('ext_agent_host_id'),/^urn:uuid:/);
  const hostRecord=(await store.get('openai-siwc/host.json')).value;assert.equal(hostRecord.id,url.searchParams.get('ext_agent_host_id'));
  fake.fake.onToken=form=>({status:200,body:JSON.stringify({access_token:'first-access-private',refresh_token:'first-refresh-private',id_token:tokenFor({sub:'first-subject',aud:form.get('client_id'),nonce,email:'first@example.com'}),expires_in:3600,scope:SCOPE})});
  const done=await complete(service,{id:add.data.id,ticket:add.ticket,state:url.searchParams.get('state'),code:'first-code',clientId:'oaiapp_first'});
  assert.equal(done.data.status,'complete');
  const latest=await control.latestCredentials(store);assert.equal(latest.revision,1);assert.equal(latest.credentials.subject,'first-subject');
  const list=await(await service.call('/admin/openai/accounts')).json();assert.equal(list.accounts.length,1);assert.equal(list.accounts[0].status,'active');
 }finally{await new Promise(resolve=>service.app.close(resolve));}
});

test('新增账号使用dynamic_agent_client与新PKCE，claim幂等且严格拒绝ticket、state和redirect',async()=>{
 const store=new MemoryStore(),clock=clockAt();await seedActive(store,clock);
 const fake=fakeNetwork({token:()=>({status:200,body:'{}'})});
 const control=createAuthorizationControl({store,now:clock.now,network:fake.network});
 const service=await startService({store,clock,control});
 try{
  const add=await authorizeAdd(service);
  assert.equal(add.status,200);assert.match(add.data.id,/^[a-f0-9-]{36}$/);assert.equal(add.data.expiresAt,clock.now()+15*60000);assert.match(add.data.launchUrl,/^http:\/\/127\.0\.0\.1:24765\/#id=/);
  assert(!add.data.launchUrl.includes('access_token'));
  const wrongRedirect=await claim(service,add.data.id,add.ticket,'http://127.0.0.1:9999/auth/callback');assert.equal(wrongRedirect.status,400);assert.equal(wrongRedirect.data.error,'OPENAI_AUTHORIZATION_REDIRECT_INVALID');
  const wrongTicket=await claim(service,add.data.id,'x'.repeat(43));assert.equal(wrongTicket.status,403);assert.equal(wrongTicket.data.error,'OPENAI_AUTHORIZATION_TICKET_INVALID');
  const first=await claim(service,add.data.id,add.ticket);assert.equal(first.status,200);
  const second=await claim(service,add.data.id,add.ticket);assert.equal(second.status,200);assert.equal(second.data.authorizationUrl,first.data.authorizationUrl);
  const url=new URL(first.data.authorizationUrl);
  assert.equal(url.origin,'https://auth.openai.com');assert.equal(url.pathname,'/api/accounts/authorize');
  assert.equal(url.searchParams.get('client_id'),'dynamic_agent_client');assert.equal(url.searchParams.get('redirect_uri'),REDIRECT);
  assert.equal(url.searchParams.get('ext_agent_host_id'),'urn:uuid:00000000-0000-4000-8000-000000000001');
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('nonce').length,43);assert.equal(url.searchParams.get('state').length,43);
  assert(url.searchParams.get('scope').includes('chatgpt.tokens.use.direct'));assert(!url.searchParams.has('id_token_hint'));assert.equal(url.searchParams.has('agent_name_hint'),true);
  const attempt=(await store.get('openai-siwc/authorization/'+add.data.id+'/attempt.json')).value;
  assert.equal(crypto.createHash('sha256').update(attempt.verifier).digest('base64url'),url.searchParams.get('code_challenge'));
  const nonce=url.searchParams.get('nonce');
  fake.fake.onToken=form=>({status:200,body:JSON.stringify({access_token:'new-access-private',refresh_token:'new-refresh-private',id_token:tokenFor({sub:'new-subject',aud:form.get('client_id'),nonce,email:'teacher@example.com'}),expires_in:3600,scope:SCOPE})});
  const badState=await complete(service,{id:add.data.id,ticket:add.ticket,state:'wrong-state-value-000000',clientId:'oaiapp_new'});assert.equal(badState.status,400);assert.equal(badState.data.error,'OPENAI_AUTHORIZATION_STATE_INVALID');assert.equal(fake.tokenCalls,0);
  const done=await complete(service,{id:add.data.id,ticket:add.ticket,state:url.searchParams.get('state'),code:'code-1',clientId:'oaiapp_new'});
  assert.equal(done.status,200);assert.equal(done.data.status,'complete');assert.equal(fake.tokenCalls,1);
  const latest=await control.latestCredentials(store);assert.equal(latest.revision,2);assert.equal(latest.credentials.client_id,'oaiapp_new');assert.equal(latest.credentials.subject,'new-subject');
  const list=await(await service.call('/admin/openai/accounts')).json();
  assert.equal(list.accounts.length,2);assert.equal(list.accounts[0].status,'active');assert.equal(list.accounts[0].emailMasked,'t***@example.com');assert.equal(list.accounts[1].status,'saved');assert.equal(list.accounts[1].emailMasked,'o***@example.com');
  const publicText=JSON.stringify({add:add.data,claim:first.data,status:done.data,list});
  for(const secret of ['new-access-private','new-refresh-private','new-subject','oaiapp_new','teacher@example.com','old-id-token-private'])assert(!publicText.includes(secret),secret);
 }finally{await new Promise(resolve=>service.app.close(resolve));}
});

test('重新授权校验保存的subject，身份不匹配失败且不覆盖当前账号，匹配后可切换',async()=>{
 const store=new MemoryStore(),clock=clockAt();await seedActive(store,clock);
 const fake=fakeNetwork({token:()=>({status:200,body:'{}'})});
 const control=createAuthorizationControl({store,now:clock.now,network:fake.network});
 const service=await startService({store,clock,control});
 try{
  const first=await newAccountFlow({service,network:fake});
  assert.equal(first.done.data.status,'complete');
  const list=await(await service.call('/admin/openai/accounts')).json(),old=list.accounts.find(account=>account.status==='saved'),newAccount=list.accounts.find(account=>account.status==='active');
  assert(old);assert(newAccount);
  const begin=await(await service.call('/admin/openai/authorize',{method:'POST',body:{mode:'reauthorize',accountId:old.id}})).json();
  const ticket=ticketFrom(begin.launchUrl);
  let claimed=await claim(service,begin.id,ticket);assert.equal(claimed.status,200);
  let url=new URL(claimed.data.authorizationUrl);
  assert.equal(url.searchParams.get('client_id'),'oaiapp_old');assert.equal(url.searchParams.get('id_token_hint'),'old-id-token-private');assert.equal(url.searchParams.get('login_hint'),'old@example.com');assert.equal(url.searchParams.has('agent_name_hint'),false);
  const nonce=url.searchParams.get('nonce');
  fake.fake.onToken=form=>({status:200,body:JSON.stringify({access_token:'wrong-access-private',refresh_token:'wrong-refresh-private',id_token:tokenFor({sub:'different-subject',aud:form.get('client_id'),nonce}),expires_in:3600,scope:SCOPE})});
  const mismatch=await complete(service,{id:begin.id,ticket,state:url.searchParams.get('state'),code:'code-mismatch',clientId:'oaiapp_old'});
  assert.equal(mismatch.status,200);assert.equal(mismatch.data.status,'failed');assert.equal(mismatch.data.error,'OPENAI_AUTHORIZATION_IDENTITY_MISMATCH');
  let latest=await control.latestCredentials(store);assert.equal(latest.revision,2);assert.equal(latest.credentials.subject,'new-subject');
  const retry=await(await service.call('/admin/openai/authorize',{method:'POST',body:{mode:'reauthorize',accountId:old.id}})).json(),retryTicket=ticketFrom(retry.launchUrl);
  claimed=await claim(service,retry.id,retryTicket);url=new URL(claimed.data.authorizationUrl);
  fake.fake.onToken=form=>({status:200,body:JSON.stringify({access_token:'old-new-access-private',refresh_token:'old-new-refresh-private',id_token:tokenFor({sub:'old-subject',aud:form.get('client_id'),nonce:url.searchParams.get('nonce'),email:'old@example.com'}),expires_in:3600,scope:SCOPE})});
  const switched=await complete(service,{id:retry.id,ticket:retryTicket,state:url.searchParams.get('state'),code:'code-switch',clientId:'oaiapp_old'});
  assert.equal(switched.data.status,'complete');
  latest=await control.latestCredentials(store);assert.equal(latest.revision,3);assert.equal(latest.credentials.subject,'old-subject');assert.equal(latest.credentials.access_token,'old-new-access-private');
  const after=await(await service.call('/admin/openai/accounts')).json();assert.equal(after.activeId,old.id);assert.equal(after.accounts.find(account=>account.id===old.id).status,'active');assert.equal(after.accounts.find(account=>account.id===newAccount.id)?.status,'saved');
 }finally{await new Promise(resolve=>service.app.close(resolve));}
});

test('并发回调只交换一次授权码且最终只保留一个活动账号',async()=>{
 const store=new MemoryStore(),clock=clockAt();await seedActive(store,clock);
 const fake=fakeNetwork({delay:60,token:()=>({status:200,body:'{}'})});
 const control=createAuthorizationControl({store,now:clock.now,network:fake.network});
 const service=await startService({store,clock,control});
 try{
  const add=await authorizeAdd(service),claimed=await claim(service,add.data.id,add.ticket),url=new URL(claimed.data.authorizationUrl),nonce=url.searchParams.get('nonce');
  fake.fake.onToken=form=>({status:200,body:JSON.stringify({access_token:'concurrent-access-private',refresh_token:'concurrent-refresh-private',id_token:tokenFor({sub:'concurrent-subject',aud:form.get('client_id'),nonce}),expires_in:3600,scope:SCOPE})});
  const results=await Promise.all([complete(service,{id:add.data.id,ticket:add.ticket,state:url.searchParams.get('state'),code:'concurrent-code',clientId:'oaiapp_concurrent'}),complete(service,{id:add.data.id,ticket:add.ticket,state:url.searchParams.get('state'),code:'concurrent-code',clientId:'oaiapp_concurrent'})]);
  assert.equal(fake.tokenCalls,1);
  assert(results.some(result=>['complete','exchanging'].includes(result.data.status)));
  const status=await(await service.call('/admin/openai/authorize/'+add.data.id)).json();assert.equal(status.status,'complete');
  const latest=await control.latestCredentials(store);assert.equal(latest.credentials.subject,'concurrent-subject');
 }finally{await new Promise(resolve=>service.app.close(resolve));}
});

test('取消和超时不交换授权码，当前账号保持不变',async()=>{
 const store=new MemoryStore(),clock=clockAt();await seedActive(store,clock);
 const fake=fakeNetwork({token:()=>({status:200,body:'{}'})});
 const control=createAuthorizationControl({store,now:clock.now,network:fake.network});
 const service=await startService({store,clock,control});
 try{
  const add=await authorizeAdd(service),claimed=await claim(service,add.data.id,add.ticket),url=new URL(claimed.data.authorizationUrl);
  const cancelled=await(await service.call('/admin/openai/authorize/'+add.data.id+'/cancel',{method:'POST',body:{}})).json();assert.equal(cancelled.status,'cancelled');
  const claimAfter=await claim(service,add.data.id,add.ticket);assert.equal(claimAfter.status,410);
  const done=await complete(service,{id:add.data.id,ticket:add.ticket,state:url.searchParams.get('state'),code:'should-not-exchange',clientId:'oaiapp_x'});
  assert.equal(done.data.status,'cancelled');assert.equal(fake.tokenCalls,0);
  const expired=await authorizeAdd(service),expiredClaimed=await claim(service,expired.data.id,expired.ticket),expiredUrl=new URL(expiredClaimed.data.authorizationUrl);clock.advance(15*60000+1);
  const expiredClaim=await claim(service,expired.data.id,expired.ticket);assert.equal(expiredClaim.status,410);
  const expiredStatus=await(await service.call('/admin/openai/authorize/'+expired.data.id)).json();assert.equal(expiredStatus.status,'expired');
  const expiredComplete=await complete(service,{id:expired.data.id,ticket:expired.ticket,state:expiredUrl.searchParams.get('state'),code:'expired-code',clientId:'oaiapp_y'});
  assert.equal(expiredComplete.status,200);assert.equal(expiredComplete.data.status,'expired');
  const latest=await control.latestCredentials(store);assert.equal(latest.revision,1);assert.equal(latest.credentials.access_token,'old-access-private');assert.equal(fake.tokenCalls,0);
 }finally{await new Promise(resolve=>service.app.close(resolve));}
});

test('JWKS短暂失败保留已交换candidate，状态查询恢复验证且不重复换码',async()=>{
 const store=new MemoryStore(),clock=clockAt();await seedActive(store,clock);
 let keyCalls=0;const fake=fakeNetwork({keys:()=>++keyCalls===1?null:jwk,token:()=>({status:200,body:'{}'})});
 const control=createAuthorizationControl({store,now:clock.now,network:fake.network});
 const service=await startService({store,clock,control});
 try{
  const add=await authorizeAdd(service),claimed=await claim(service,add.data.id,add.ticket),url=new URL(claimed.data.authorizationUrl),nonce=url.searchParams.get('nonce');
  fake.fake.onToken=form=>({status:200,body:JSON.stringify({access_token:'recovered-access-private',refresh_token:'recovered-refresh-private',id_token:tokenFor({sub:'recovered-subject',aud:form.get('client_id'),nonce}),expires_in:3600,scope:SCOPE})});
  const first=await complete(service,{id:add.data.id,ticket:add.ticket,state:url.searchParams.get('state'),code:'recover-code',clientId:'oaiapp_recovered'});
  assert.equal(first.data.status,'exchanging');assert.equal(fake.tokenCalls,1);
  assert(await store.get('openai-siwc/authorization/'+add.data.id+'/candidate.json'));
  assert.equal(await store.get('openai-siwc/authorization/'+add.data.id+'/failure.json'),null);
  const recovered=await(await service.call('/admin/openai/authorize/'+add.data.id)).json();assert.equal(recovered.status,'complete');
  assert.equal(fake.tokenCalls,1);
  const latest=await control.latestCredentials(store);assert.equal(latest.revision,2);assert.equal(latest.credentials.subject,'recovered-subject');
 }finally{await new Promise(resolve=>service.app.close(resolve));}
});

test('token交换结果未知时明确失败且不重放授权码，失败不覆盖当前账号',async()=>{
 const store=new MemoryStore(),clock=clockAt();await seedActive(store,clock);
 const fake=fakeNetwork({token:()=>{throw Error('ECONNRESET');}});
 const control=createAuthorizationControl({store,now:clock.now,network:fake.network});
 const service=await startService({store,clock,control});
 try{
  const add=await authorizeAdd(service),claimed=await claim(service,add.data.id,add.ticket),url=new URL(claimed.data.authorizationUrl);
  const first=await complete(service,{id:add.data.id,ticket:add.ticket,state:url.searchParams.get('state'),code:'uncertain-code',clientId:'oaiapp_uncertain'});
  assert.equal(first.data.status,'failed');assert.equal(first.data.error,'OPENAI_AUTHORIZATION_UNCERTAIN');
  const second=await complete(service,{id:add.data.id,ticket:add.ticket,state:url.searchParams.get('state'),code:'uncertain-code',clientId:'oaiapp_uncertain'});
  assert.equal(second.data.status,'failed');assert.equal(fake.tokenCalls,1);
  const status=await(await service.call('/admin/openai/authorize/'+add.data.id)).json();assert.equal(status.status,'failed');
  const latest=await control.latestCredentials(store);assert.equal(latest.revision,1);assert.equal(latest.credentials.subject,'old-subject');
 }finally{await new Promise(resolve=>service.app.close(resolve));}
});

test('账号注册元信息保存失败时先不宣布成功，查询状态恢复后完成激活',async()=>{
 const raw=new MemoryStore(),clock=clockAt();await seedActive(raw,clock);
 let failRegistry=true;
 const store={get:key=>raw.get(key),create:async(key,value)=>{if(failRegistry&&key.startsWith('openai-siwc/accounts/'))throw Error('STORE_UNAVAILABLE');return raw.create(key,value);}};
 const fake=fakeNetwork({token:()=>({status:200,body:'{}'})});
 const control=createAuthorizationControl({store,now:clock.now,network:fake.network});
 const service=await startService({store,clock,control});
 try{
  const add=await authorizeAdd(service),claimed=await claim(service,add.data.id,add.ticket),url=new URL(claimed.data.authorizationUrl),nonce=url.searchParams.get('nonce');
  fake.fake.onToken=form=>({status:200,body:JSON.stringify({access_token:'pending-access-private',refresh_token:'pending-refresh-private',id_token:tokenFor({sub:'pending-subject',aud:form.get('client_id'),nonce}),expires_in:3600,scope:SCOPE})});
  const pending=await complete(service,{id:add.data.id,ticket:add.ticket,state:url.searchParams.get('state'),code:'pending-code',clientId:'oaiapp_pending'});
  assert.equal(pending.data.status,'exchanging');assert.equal(fake.tokenCalls,1);
  assert.equal((await control.latestCredentials(store)).revision,1);
  failRegistry=false;
  const recovered=await(await service.call('/admin/openai/authorize/'+add.data.id)).json();assert.equal(recovered.status,'complete');
  const latest=await control.latestCredentials(store);assert.equal(latest.revision,2);assert.equal(latest.credentials.subject,'pending-subject');
  const list=await(await service.call('/admin/openai/accounts')).json();assert.equal(list.accounts.filter(account=>account.status==='active').length,1);
 }finally{await new Promise(resolve=>service.app.close(resolve));}
});

test('激活后账号列表写入失败不会误报完成，状态查询可接续完成且不重复换码',async()=>{
 const raw=new MemoryStore(),clock=clockAt();await seedActive(raw,clock);
 let registryWrites=0,failRegistry=true;
 const store={get:key=>raw.get(key),create:async(key,value)=>{if(failRegistry&&key.startsWith('openai-siwc/accounts/')&&++registryWrites>=2)throw Error('STORE_UNAVAILABLE');return raw.create(key,value);}};
 const fake=fakeNetwork({token:()=>({status:200,body:'{}'})});
 const control=createAuthorizationControl({store,now:clock.now,network:fake.network});
 const service=await startService({store,clock,control});
 try{
  const add=await authorizeAdd(service),claimed=await claim(service,add.data.id,add.ticket),url=new URL(claimed.data.authorizationUrl),nonce=url.searchParams.get('nonce');
  fake.fake.onToken=form=>({status:200,body:JSON.stringify({access_token:'activated-access-private',refresh_token:'activated-refresh-private',id_token:tokenFor({sub:'activated-subject',aud:form.get('client_id'),nonce}),expires_in:3600,scope:SCOPE})});
  const pending=await complete(service,{id:add.data.id,ticket:add.ticket,state:url.searchParams.get('state'),code:'activated-code',clientId:'oaiapp_activated'});
  assert.equal(pending.data.status,'exchanging');assert.equal(fake.tokenCalls,1);
  assert.equal((await control.latestCredentials(store)).revision,2);
  failRegistry=false;
  const recovered=await(await service.call('/admin/openai/authorize/'+add.data.id)).json();assert.equal(recovered.status,'complete');
  assert.equal(fake.tokenCalls,1);
  const latest=await control.latestCredentials(store);assert.equal(latest.revision,2);assert.equal(latest.credentials.subject,'activated-subject');
  const list=await(await service.call('/admin/openai/accounts')).json();assert.equal(list.accounts.find(account=>account.status==='active').emailMasked,'n***@example.com');
 }finally{await new Promise(resolve=>service.app.close(resolve));}
});

test('缺少必需scope、未知重新授权账号和无效accountId均明确拒绝，不产生授权码交换',async()=>{
 const store=new MemoryStore(),clock=clockAt();await seedActive(store,clock);
 const fake=fakeNetwork({token:()=>({status:200,body:'{}'})});
 const control=createAuthorizationControl({store,now:clock.now,network:fake.network});
 const service=await startService({store,clock,control});
 try{
  const add=await authorizeAdd(service),claimed=await claim(service,add.data.id,add.ticket),url=new URL(claimed.data.authorizationUrl),nonce=url.searchParams.get('nonce');
  fake.fake.onToken=form=>({status:200,body:JSON.stringify({access_token:'scope-access-private',refresh_token:'scope-refresh-private',id_token:tokenFor({sub:'scope-subject',aud:form.get('client_id'),nonce}),expires_in:3600,scope:'openid profile email offline_access'})});
  const missing=await complete(service,{id:add.data.id,ticket:add.ticket,state:url.searchParams.get('state'),code:'scope-code',clientId:'oaiapp_scope'});
  assert.equal(missing.data.status,'failed');assert.equal(missing.data.error,'OPENAI_AUTHORIZATION_SCOPE_MISSING');
  assert.equal((await control.latestCredentials(store)).revision,1);
  const unknown=await service.call('/admin/openai/authorize',{method:'POST',body:{mode:'reauthorize',accountId:'a'.repeat(64)}});assert.equal(unknown.status,404);
  const invalid=await service.call('/admin/openai/authorize',{method:'POST',body:{mode:'reauthorize',accountId:'not-an-account'}});assert.equal(invalid.status,400);
  const badMode=await service.call('/admin/openai/authorize',{method:'POST',body:{mode:'delete'}});assert.equal(badMode.status,400);
 }finally{await new Promise(resolve=>service.app.close(resolve));}
});

test('未注入授权控制且无云配置的服务器不会初始化凭据存储，factory按需调用',async()=>{
 const store=new MemoryStore(),clock=clockAt(),plain=createServer({store,env});
 await new Promise(resolve=>plain.listen(0,'127.0.0.1',resolve));
 try{const response=await fetch('http://127.0.0.1:'+plain.address().port+'/health');assert.equal(response.status,200);}finally{await new Promise(resolve=>plain.close(resolve));}
 let calls=0;const control=createAuthorizationControl({store,env,now:clock.now});
 const app=createServer({store,env,now:clock.now,authorizationFactory:()=>{calls++;return control;}});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.address().port;
 try{
  assert.equal((await fetch(base+'/health')).status,200);assert.equal(calls,0);
  const code=totp.codeForCounter(seed,Math.floor(clock.now()/30000)),token=(await(await fetch(base+'/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})})).json()).token;
  assert.equal((await fetch(base+'/admin/openai/accounts',{headers:{Authorization:'Bearer '+token}})).status,200);assert.equal(calls,1);
 }finally{await new Promise(resolve=>app.close(resolve));}
});

test('JWKS持续不可用时在原授权期限内终止等待，不重复换码且保留当前账号',async()=>{
 const store=new MemoryStore(),clock=clockAt();await seedActive(store,clock);
 const fake=fakeNetwork({keys:()=>null}),control=createAuthorizationControl({store,now:clock.now,network:fake.network});
 const service=await startService({store,clock,control});
 try{
  const add=await authorizeAdd(service),claimed=await claim(service,add.data.id,add.ticket),url=new URL(claimed.data.authorizationUrl);
  fake.fake.onToken=form=>({status:200,body:JSON.stringify({access_token:'pending-access-private',refresh_token:'pending-refresh-private',id_token:tokenFor({sub:'pending-subject',aud:form.get('client_id'),nonce:url.searchParams.get('nonce')}),expires_in:3600,scope:SCOPE})});
  assert.equal((await complete(service,{id:add.data.id,ticket:add.ticket,state:url.searchParams.get('state'),clientId:'oaiapp_pending'})).data.status,'exchanging');
  clock.advance(15*60000+1);
  const result=await(await service.call('/admin/openai/authorize/'+add.data.id)).json();assert.equal(result.status,'expired');assert.equal(result.error,'OPENAI_AUTHORIZATION_EXPIRED');
  assert.equal(fake.tokenCalls,1);assert.equal((await control.latestCredentials(store)).revision,1);
  assert.equal((await authorizeAdd(service)).status,200);
 }finally{await new Promise(resolve=>service.app.close(resolve));}
});
