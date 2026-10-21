import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import crypto from 'node:crypto';
const require=createRequire(import.meta.url);
const {MemoryStore}=require('../backend/store.cjs');
const {createControl,identity,numbered,latest,validAuth}=require('../backend/codex-accounts.cjs');
const env={OPENAI_CODEX_ENABLED:'true'},owner='a'.repeat(32);
const authFor=n=>({auth_mode:'chatgpt',OPENAI_API_KEY:null,tokens:{account_id:'workspace-'+n,access_token:'private-access-'+n,refresh_token:'private-refresh-'+n,id_token:'private-id-'+n}});
const info=n=>({type:'chatgpt',email:'teacher'+n+'@example.test',planType:'plus'});
test('a nullable official email does not reject an otherwise authorized account',()=>{
 const auth=authFor(1);auth.tokens.id_token='e30.'+Buffer.from(JSON.stringify({sub:'official-stable-subject'})).toString('base64url')+'.example';
 const a=identity({type:'chatgpt',email:null,planType:'plus'},auth);
 assert.match(a.id,/^[a-f0-9]{32}$/);assert(!JSON.stringify(a).includes('official-stable-subject'));
 assert.equal(a.id,identity({type:'chatgpt',email:'updated@example.test',planType:'plus'},auth).id);
});
async function setup(){
 const store=new MemoryStore(),jobs=new MemoryStore(),accounts=[1,2].map(n=>({...identity(info(n),authFor(n)),epoch:'epoch-'+n,status:'ready',authorizedAt:10}));
 await store.create(numbered('registry',1),{revision:1,activeId:accounts[0].id,accounts});
 for(let n=1;n<=2;n++)await store.create(numbered('auth/'+accounts[n-1].id+'/epoch-'+n,1),{auth:authFor(n),digest:'initial',at:10});
 const runtimeFactory=async options=>{
  let auth=structuredClone(options.auth);
  return {call:async()=>({account:info(auth.tokens.account_id.endsWith('1')?1:2)}),getAuth:()=>structuredClone(auth),close:async()=>{},rotate:async()=>{auth.tokens.refresh_token+='-rotated';await options.onAuth(auth);}};
 };
 const control=createControl({store,jobStore:jobs,owner,env,network:fn=>fn(),runtimeFactory});
 return {control,store,jobs,accounts,runtimeFactory};
}
test('official OAuth account rows never expose auth blobs or workspace identifiers',async()=>{
 const {control}=await setup(),state=await control.accounts(),text=JSON.stringify(state);
 assert.equal(state.accounts.length,2);assert.equal(state.accounts[0].active,true);
 for(const privateValue of ['private-access','private-refresh','private-id','workspace-','teacher1@','epoch-'])assert(!text.includes(privateValue));
 assert(state.accounts[0].emailMasked.includes('***'));
});
test('activating another saved account does not move an already frozen task',async()=>{
 const {control,accounts}=await setup(),bound=await control.bind({provider:'openai-codex',model:'test'});
 assert.equal(bound.codexAccountId,accounts[0].id);
 await control.activate({accountId:accounts[1].id,expectedRevision:1});
 assert.equal((await control.bind(bound)).codexAccountId,accounts[0].id);
 assert.equal((await control.bind({provider:'openai-codex'})).codexAccountId,accounts[1].id);
 await assert.rejects(control.activate({accountId:accounts[0].id,expectedRevision:1}),/CODEX_REVISION_CONFLICT/);
});
test('only one runtime may use an account refresh chain at a time',async()=>{
 const {control,accounts}=await setup();let release,started;
 const gate=new Promise(r=>release=r),ready=new Promise(r=>started=r);
 const first=control.withAccount(accounts[0].id,async()=>{started();await gate;return 'first';});
 await ready;
 await assert.rejects(control.withAccount(accounts[0].id,async()=>{}),/CODEX_ACCOUNT_BUSY/);
 assert.equal(await control.withAccount(accounts[1].id,async()=> 'other'),'other');
 release();assert.equal(await first,'first');
 assert.equal(await control.withAccount(accounts[0].id,async()=> 'next'),'next');
});
test('a rotated credential is durably saved before its account lease is released',async()=>{
 const {control,store,accounts}=await setup(),a=accounts[0];
 await control.withAccount(a.id,rt=>rt.rotate());
 const current=await latest(store,'auth/'+a.id+'/'+a.epoch);
 assert.equal(current.revision,2);assert(current.value.auth.tokens.refresh_token.endsWith('-rotated'));
 assert(await store.get('openai-codex/leases/'+a.id+'/'+a.epoch+'/1/released.json'));
});
test('failed credential persistence blocks reuse instead of replaying the old refresh token',async()=>{
 const {control,store,accounts}=await setup(),a=accounts[0],original=store.create.bind(store);
 store.create=async(key,value)=>{if(key.startsWith('openai-codex/auth/'))throw Error('CODEX_AUTH_PERSIST_FAILED');return original(key,value);};
 await assert.rejects(control.withAccount(a.id,rt=>rt.rotate()),/CODEX_AUTH_PERSIST_FAILED/);
 assert.equal((await control.accounts()).accounts.find(row=>row.id===a.id).status,'reauthorize');
 await assert.rejects(control.withAccount(a.id,async()=>{}),/CODEX_ACCOUNT_REAUTH_REQUIRED/);
});
test('an abandoned runtime is not resumed with a possibly consumed refresh token',async()=>{
 const {store,jobs,accounts,runtimeFactory}=await setup(),a=accounts[0];
 await store.create(numbered('leases/'+a.id+'/'+a.epoch,1),{at:1,owner:'abandoned'});
 const control=createControl({store,jobStore:jobs,owner,env,now:()=>1000000,network:fn=>fn(),runtimeFactory});
 await assert.rejects(control.withAccount(a.id,async()=>{}),/CODEX_ACCOUNT_REAUTH_REQUIRED/);
 assert.equal((await control.accounts()).accounts.find(row=>row.id===a.id).status,'reauthorize');
});
test('remote login initiation is idempotent and cancellation survives a new controller instance',async()=>{
 const {control,store,jobs}=await setup(),id='10000000-0000-4000-8000-000000000001';
 const first=await control.begin({mode:'add'},id),second=await control.begin({mode:'add'},id);
 assert.equal(first.id,second.id);assert.equal((await control.status(id)).status,'queued');
 const device={verificationUrl:'https://auth.openai.com/codex/device',userCode:'DEMO-CODE'};
 await store.create('openai-codex/attempts/'+id+'/device.json',device);
 assert.equal((await control.status(id)).status,'waiting');
 await control.cancel(id);
 const restored=createControl({store,jobStore:jobs,owner,env});
 assert.equal((await restored.status(id)).status,'cancelled');
 assert.equal((await restored.status(id)).userCode,undefined);
 await assert.rejects(control.begin({mode:'reauthorize',accountId:'b'.repeat(32)},id),/CODEX_ACCOUNT_NOT_FOUND/);
});
test('account quota is read from snapshots without running or charging the model',async()=>{
 const {control,store,accounts}=await setup(),a=accounts[0];
 await store.create(numbered('quota/'+a.id,1),{epoch:a.epoch,fetchedAt:123,rateLimits:{primary:{usedPercent:15,windowDurationMins:300,resetsAt:1800000000},secondary:null}});
 const state=await control.accounts();assert.equal(state.accounts[0].quota.rateLimits.primary.usedPercent,15);assert.equal(state.accounts[0].quota.rateLimits.secondary,null);
});
test('SIWC and other provider settings are left untouched and API-key auth is rejected',async()=>{
 const {control,store,accounts}=await setup();
 const siwc={credentials:{refresh_token:'existing-plan-token'}};
 await store.create('openai-siwc/credentials/0000000001.json',siwc);
 await control.activate({accountId:accounts[1].id,expectedRevision:1});
 assert.deepEqual((await store.get('openai-siwc/credentials/0000000001.json')).value,siwc);
 const old={provider:'openai-chatgpt',model:'test'};assert.equal(await control.bind(old),old);
 assert.equal(validAuth({OPENAI_API_KEY:'do-not-mix',tokens:authFor(1).tokens}),false);
});

test('all remote account management routes keep the existing TOTP and Origin boundaries',async()=>{
 const {createServer}=require('../backend/server.cjs'),totp=require('../backend/totp.cjs');
 const {control,jobs}=await setup(),at=1800000000000,settings={...env,TRAINING_SESSION_SECRET:'test-only-cloud-oauth-'+crypto.randomBytes(24).toString('hex'),TRAINING_TOTP_SECRET:totp.encodeSecret(Buffer.from('12345678901234567890')),TRAINING_ORIGINS:'https://school.test'};
 const server=createServer({store:jobs,env:settings,now:()=>at,codexControl:control});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let token='';
 const call=(path,{method='GET',body,origin='https://school.test',auth=true}={})=>fetch(base+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(token&&auth?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 try{
  assert.equal((await call('/admin/codex/accounts')).status,401);
  assert.equal((await call('/admin/codex/authorize',{method:'POST',body:{mode:'add'}})).status,401);
  assert.equal(jobs.data.size,0);
  token=(await(await call('/session',{method:'POST',body:{code:totp.codeForCounter(settings.TRAINING_TOTP_SECRET,Math.floor(at/30000))}})).json()).token;
  const accounts=await call('/admin/codex/accounts');assert.equal(accounts.status,200);assert.equal((await accounts.json()).enabled,true);
  assert.equal((await call('/admin/codex/accounts',{origin:'https://evil.test'})).status,403);
  assert.equal((await call('/admin/codex/authorize',{method:'POST',body:{mode:'add',redirectUri:'https://evil.test/callback'}})).status,400);
  const attempt=await call('/admin/codex/authorize',{method:'POST',body:{mode:'add'}});assert.equal(attempt.status,202);
  const id=(await attempt.json()).id;assert.equal((await call('/admin/codex/authorize/'+id,{auth:false})).status,401);
  assert.equal((await call('/admin/codex/authorize/'+id+'/cancel',{method:'POST',body:{}})).status,200);
 }finally{await new Promise(r=>server.close(r));}
});

test('successful device authorization promotes the final durable snapshot after runtime close',async()=>{
 const {store,jobs,accounts}=await setup(),auth=authFor(3),id='30000000-0000-4000-8000-000000000001';
 const control=createControl({store,jobStore:jobs,owner,env,network:fn=>fn(),runtimeFactory:async options=>({getAuth:()=>auth,close:async()=>{auth.tokens.refresh_token+='-final';await options.onAuth(auth);}}),runtimeMethods:{login:async(rt,options)=>{assert(options.deadlineMs<=840000);await options.onReady({verificationUrl:'https://auth.openai.com/codex/device',userCode:'TEST-CODE'});return {account:info(3),auth:structuredClone(auth)};}}});
 await control.begin({mode:'add'},id);const key='jobs/'+owner+'/'+id;
 assert.equal((await control.run(key,(await jobs.get(key+'/meta.json')).value)).ok,true);
 const status=await control.status(id),state=await control.accounts();assert.equal(status.status,'complete');assert.equal(state.accounts.length,3);assert.notEqual(state.activeId,accounts[0].id);
 const a=(await control.registry()).accounts.find(a=>a.id===state.activeId),saved=await latest(store,'auth/'+a.id+'/'+a.epoch);
 assert(saved.value.auth.tokens.refresh_token.endsWith('-final'));
 assert.equal((await control.run(key,(await jobs.get(key+'/meta.json')).value)).skipped,true);
});
test('cancelling an in-flight official login never promotes its candidate or changes the active account',async()=>{
 const {store,jobs,accounts}=await setup(),id='40000000-0000-4000-8000-000000000001';let control;
 control=createControl({store,jobStore:jobs,owner,env,network:fn=>fn(),runtimeFactory:async()=>({close:async()=>{},getAuth:()=>null}),runtimeMethods:{login:async(rt,options)=>{await options.onReady({verificationUrl:'https://auth.openai.com/codex/device',userCode:'TEST-CODE'});await control.cancel(id);assert.equal(await options.isCancelled(),true);throw Error('LOGIN_CANCELLED');}}});
 await control.begin({mode:'add'},id);const key='jobs/'+owner+'/'+id;
 await control.run(key,(await jobs.get(key+'/meta.json')).value);
 assert.equal((await control.status(id)).status,'cancelled');assert.equal((await control.accounts()).activeId,accounts[0].id);
 assert.equal((await control.accounts()).accounts.length,2);
});

test('a confirmed OAuth grant survives each storage commit interruption without another login',async()=>{
 for(const stage of ['auth','registry','result']){
  const {store,jobs}=await setup(),id=crypto.randomUUID(),auth=authFor(3);let logins=0,broken=false;
  const create=store.create.bind(store);
  store.create=async(key,value)=>{
   const target=stage==='auth'?key.startsWith('openai-codex/auth/')&&key.includes(identity(info(3),auth).id):stage==='registry'?key===numbered('registry',2):key==='openai-codex/attempts/'+id+'/result.json';
   if(target&&!broken){broken=true;throw Error('STORE_UNAVAILABLE');}
   return create(key,value);
  };
  const control=createControl({store,jobStore:jobs,owner,env,network:fn=>fn(),runtimeFactory:async options=>({getAuth:()=>auth,close:async()=>options.onAuth(auth)}),runtimeMethods:{login:async()=>{logins++;return {account:info(3),auth};}}});
  await control.begin({mode:'add'},id);const key='jobs/'+owner+'/'+id;
  await assert.rejects(control.run(key,(await jobs.get(key+'/meta.json')).value),/CODEX_AUTH_COMMIT_PENDING/);
  const result=await control.status(id);assert.equal(result.status,'complete',stage);assert.equal(logins,1,stage);
  const a=(await control.registry()).accounts.find(a=>a.id===result.accountId);assert(a);
  const revision=(await control.registry()).revision;await control.status(id);assert.equal((await control.registry()).revision,revision);
 }
});
test('a committing authorization rejects cancellation even when the race is lost during create',async()=>{
 const {control,store}=await setup(),id=crypto.randomUUID();await control.begin({mode:'add'},id);
 const create=store.create.bind(store),key='openai-codex/attempts/'+id+'/terminal.json';
 store.create=async(path,value)=>{if(path===key&&value.status==='cancelled'){await create(key,{status:'committing',at:Date.now()});return false;}return create(path,value);};
 await assert.rejects(control.cancel(id),/CODEX_AUTHORIZATION_IN_PROGRESS/);
});
test('the same request id cannot mix concurrently submitted authorization intents',async()=>{
 const {control,store,jobs,accounts}=await setup(),id=crypto.randomUUID(),meta='jobs/'+owner+'/'+id+'/meta.json',get=jobs.get.bind(jobs);let reads=0,release;
 const gate=new Promise(r=>release=r);
 jobs.get=async key=>{if(key===meta&&reads<2){reads++;if(reads===2)release();await gate;return null;}return get(key);};
 const attempts=await Promise.allSettled([control.begin({mode:'add'},id),control.begin({mode:'reauthorize',accountId:accounts[0].id},id)]);
 assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);assert.equal(attempts.find(r=>r.status==='rejected').reason.message,'REQUEST_ID_CONFLICT');
 const job=(await get(meta)).value,request=(await store.get('openai-codex/attempts/'+id+'/request.json')).value;
 assert.equal(job.fingerprint,request.fingerprint);assert.equal(job.input.mode,request.mode);
});
test('a refresh cannot persist another workspace credential into the selected account',async()=>{
 const {store,jobs,accounts}=await setup(),a=accounts[0];
 const control=createControl({store,jobStore:jobs,owner,env,network:fn=>fn(),runtimeFactory:async options=>({call:async()=>({account:info(1)}),getAuth:()=>authFor(1),close:async()=>{},mix:()=>options.onAuth(authFor(2))})});
 await assert.rejects(control.withAccount(a.id,rt=>rt.mix()),/CODEX_ACCOUNT_IDENTITY_INVALID/);
 assert.equal((await latest(store,'auth/'+a.id+'/'+a.epoch)).revision,1);
 assert.equal((await control.accounts()).accounts.find(row=>row.id===a.id).status,'reauthorize');
});
test('a closed runtime with a missed release marker can recover the lease without reauthorization',async()=>{
 const {control,store,accounts}=await setup(),a=accounts[0],create=store.create.bind(store);let failing=true;
 store.create=async(key,value)=>{if(failing&&key.endsWith('/released.json'))throw Error('STORE_UNAVAILABLE');return create(key,value);};
 assert.equal(await control.withAccount(a.id,async()=> 'finished'),'finished');failing=false;
 assert.equal(await control.withAccount(a.id,async()=> 'next'),'next');
 assert.equal((await control.accounts()).accounts.find(row=>row.id===a.id).status,'ready');
});
