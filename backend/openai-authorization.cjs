'use strict';
// Multi-account ChatGPT OAuth management. Account tokens remain in the existing
// immutable, encrypted credential versions; this module only adds verified
// account metadata and short-lived authorization attempts.
const crypto=require('node:crypto');
const {secureStore,versionKey,validCredentials}=require('./openai-credentials.cjs');
const {withProxy}=require('./openai-proxy.cjs');
const {hash}=require('./tencent.cjs');

const PREFIX='openai-siwc/';
const APPLICATION='Jianwei Observatory';
const ISSUER='https://auth.openai.com';
const TOKEN_URL=ISSUER+'/api/accounts/oauth/token';
const JWKS_URL=ISSUER+'/.well-known/jwks.json';
const RESOURCE='https://api.openai.com/v1';
const ASSISTANT_ORIGIN='http://127.0.0.1:24765';
const REDIRECT_URI=ASSISTANT_ORIGIN+'/auth/callback';
const SCOPES='openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const REQUIRED_SCOPES=['resource.invoke','chatgpt.tokens.use.direct'];
const ATTEMPT_TTL=15*60*1000;
const EXCHANGE_GRACE=55000;
const TOKEN_TIMEOUT=20000;
const JWKS_TIMEOUT=10000;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const TICKET=/^[A-Za-z0-9_-]{40,128}$/;
const ACCOUNT_ID=/^[a-f0-9]{64}$/;
const CLIENT_ID=/^oaiapp_[A-Za-z0-9_-]{1,480}$/;
const HOST_ID=/^urn:uuid:[a-f0-9-]{36}$/i;
const fail=(status,code)=>Object.assign(Error(code),{status,code});
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);};
const random=bytes=>crypto.randomBytes(bytes).toString('base64url');
const record=async(store,key)=>(await store.get(key))?.value||null;
const attemptBase=id=>PREFIX+'authorization/'+id+'/';
const registryKey=revision=>PREFIX+'accounts/'+String(revision).padStart(10,'0')+'.json';
const exact=(value,keys)=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key));
const enabled=env=>{if(env.OPENAI_SIWC_ENABLED==='true')return true;try{return JSON.parse(env.TRAINING_CONFIGURED_PROVIDERS||'[]').includes('openai-chatgpt');}catch{return false;}};

function accountIdFor(credentials){
 const issuer=credentials?.issuer,clientId=credentials?.client_id,subject=credentials?.subject;
 if(typeof issuer!=='string'||typeof clientId!=='string'||typeof subject!=='string'||!subject)return null;
 return hash(issuer+'\n'+clientId+'\n'+subject);
}
function maskEmail(value){
 if(typeof value!=='string'||value.length>320)return null;
 const at=value.indexOf('@');if(at<1||at===value.length-1)return null;
 const local=value.slice(0,at).replace(/[\u0000-\u001f\u007f]/g,''),domain=value.slice(at+1).replace(/[\u0000-\u001f\u007f]/g,'');
 if(!local||!domain)return null;
 return local[0]+'***@'+domain.slice(0,190);
}
function safeLabel(name,masked,id){
 if(typeof name==='string'){
  const cleaned=name.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,80);
  if(cleaned&&!cleaned.includes('@'))return cleaned;
  if(cleaned.includes('@')){const maskedName=maskEmail(cleaned);if(maskedName)return maskedName;}
 }
 return masked||('ChatGPT 账号 '+id.slice(0,6));
}
function scopesFrom(value){
 if(typeof value!=='string')return [];
 return [...new Set(value.split(/\s+/).filter(Boolean))];
}
function earliestRefreshAt(value){
 let at=Number(value)||Date.parse(value)||0;
 return at&&at<1e12?at*1000:at;
}
function accountFromCredentials(credentials,fallbackAt){
 const id=accountIdFor(credentials);if(!id)return null;
 const email=typeof credentials.email==='string'?credentials.email:null,masked=maskEmail(email);
 const savedAt=Date.parse(credentials.saved_at);
 return {id,label:safeLabel(null,masked,id),emailMasked:masked,email,issuer:credentials.issuer,clientId:credentials.client_id,subject:credentials.subject,idTokenHint:credentials.id_token,hostId:credentials.ext_agent_host_id,authorizedAt:Number.isFinite(savedAt)?savedAt:fallbackAt,accessExpiresAt:Number.isFinite(credentials.expires_at)?credentials.expires_at:null,reauthReady:true};
}
function publicAccount(account,activeId){
 const active=account.id===activeId,masked=account.emailMasked||maskEmail(account.email)||null;
 const ready=account.reauthReady!==false&&CLIENT_ID.test(account.clientId||'')&&typeof account.subject==='string'&&!!account.subject&&typeof account.idTokenHint==='string'&&!!account.idTokenHint;
 return {id:account.id,label:safeLabel(account.label,masked,account.id),emailMasked:masked,status:active?'active':ready?'saved':'reauthorize',active,authorizedAt:Number.isFinite(account.authorizedAt)?account.authorizedAt:null,accessExpiresAt:Number.isFinite(account.accessExpiresAt)?account.accessExpiresAt:null};
}

async function latestCredentials(store){
 let low=0,high=1;
 while(await store.get(versionKey(high))){low=high;high=high*2+1;}
 while(high-low>1){const mid=Math.floor((low+high)/2);if(await store.get(versionKey(mid)))low=mid;else high=mid;}
 if(!low)return null;
 const value=(await store.get(versionKey(low)))?.value;
 return {revision:low,credentials:value?.credentials||null};
}
async function latestRegistry(store){
 let low=0,high=1;
 while(await store.get(registryKey(high))){low=high;high=high*2+1;}
 while(high-low>1){const mid=Math.floor((low+high)/2);if(await store.get(registryKey(mid)))low=mid;else high=mid;}
 if(!low)return {revision:0,accounts:[]};
 const value=(await store.get(registryKey(low)))?.value;
 return {revision:low,accounts:Array.isArray(value?.accounts)?value.accounts:[]};
}
async function createOnce(store,key,value){
 if(await store.create(key,value))return value;
 return (await store.get(key))?.value||null;
}

function createIdTokenVerifier({network=withProxy,now=Date.now}={}){
 let cache={until:0,keys:[]};
 async function fetchKeys(){
  let response;try{response=await network(transport=>transport(JWKS_URL,{timeout:JWKS_TIMEOUT,deadlineMs:JWKS_TIMEOUT,maxBytes:128*1024}));}catch{throw Error('OPENAI_AUTH_TEMPORARY');}
  if(!response||response.status!==200)throw Error('OPENAI_AUTH_TEMPORARY');
  let keys;try{keys=JSON.parse(response.body).keys;}catch{throw Error('OPENAI_AUTH_TEMPORARY');}
  if(!Array.isArray(keys))throw Error('OPENAI_AUTH_TEMPORARY');
  cache={until:now()+300000,keys};return keys;
 }
 return async function verify(token,{clientId,nonce,subject,issuer=ISSUER,at=now()}={}){
  let header,claims,parts;try{
   parts=String(token||'').split('.');
   if(parts.length!==3)throw Error();
   header=JSON.parse(Buffer.from(parts[0],'base64url'));
   claims=JSON.parse(Buffer.from(parts[1],'base64url'));
  }catch{throw Error('OPENAI_AUTHORIZATION_IDENTITY_INVALID');}
  if(header.alg!=='RS256'||!header.kid)throw Error('OPENAI_AUTHORIZATION_IDENTITY_INVALID');
  let keys=cache.until>now()?cache.keys:await fetchKeys(),jwk=keys.find(key=>key.kid===header.kid);
  if(!jwk){keys=await fetchKeys();jwk=keys.find(key=>key.kid===header.kid);}
  if(!jwk||jwk.use&&jwk.use!=='sig'||jwk.alg&&jwk.alg!=='RS256')throw Error('OPENAI_AUTHORIZATION_IDENTITY_INVALID');
  let key;try{key=crypto.createPublicKey({key:jwk,format:'jwk'});}catch{throw Error('OPENAI_AUTH_TEMPORARY');}
  let valid;try{valid=crypto.verify('sha256',Buffer.from(parts[0]+'.'+parts[1]),key,Buffer.from(parts[2],'base64url'));}catch{valid=false;}
  const seconds=at/1000,audience=Array.isArray(claims.aud)?claims.aud:[claims.aud];
  if(!valid||claims.iss!==issuer||!audience.includes(clientId)||Array.isArray(claims.aud)&&claims.aud.length>1&&claims.azp!==clientId||!Number.isFinite(claims.exp)||claims.exp<=seconds||claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf>seconds+30)||claims.iat!==undefined&&(!Number.isFinite(claims.iat)||claims.iat>seconds+30))throw Error('OPENAI_AUTHORIZATION_IDENTITY_INVALID');
  if(typeof claims.nonce!=='string'||!equal(claims.nonce,nonce))throw Error('OPENAI_AUTHORIZATION_NONCE_INVALID');
  if(typeof claims.sub!=='string'||!claims.sub)throw Error('OPENAI_AUTHORIZATION_IDENTITY_INVALID');
  if(subject!==undefined&&claims.sub!==subject)throw Error('OPENAI_AUTHORIZATION_IDENTITY_MISMATCH');
  return claims;
 };
}

function createAuthorizationControl({store,env=process.env,now=Date.now,network=withProxy,verify}={}){
 store||=secureStore({env});
 const verifyToken=verify||createIdTokenVerifier({network,now});

 async function hostId(){
  const latest=await latestCredentials(store),active=latest?.credentials?.ext_agent_host_id;
  if(HOST_ID.test(active||''))return active;
  if(HOST_ID.test(env.OPENAI_AGENT_HOST_ID||''))return env.OPENAI_AGENT_HOST_ID;
  const key=PREFIX+'host.json',saved=await record(store,key);
  if(HOST_ID.test(saved?.id||''))return saved.id;
  const created=await createOnce(store,key,{id:'urn:uuid:'+crypto.randomUUID(),createdAt:now()});
  if(HOST_ID.test(created?.id||''))return created.id;
  throw fail(503,'OPENAI_AUTHORIZATION_UNAVAILABLE');
 }
 async function knownAccount(accountId){
  if(!ACCOUNT_ID.test(accountId||''))throw fail(400,'OPENAI_ACCOUNT_ID_INVALID');
  const registry=await latestRegistry(store),found=registry.accounts.find(account=>account?.id===accountId);
  if(found){
   const expected=accountIdFor({issuer:found.issuer,client_id:found.clientId,subject:found.subject});
   if(expected!==found.id)throw fail(409,'OPENAI_ACCOUNT_REAUTH_UNAVAILABLE');
   if(found.reauthReady===false||!CLIENT_ID.test(found.clientId||'')||found.issuer!==ISSUER||typeof found.subject!=='string'||!found.subject||typeof found.idTokenHint!=='string'||!found.idTokenHint)throw fail(409,'OPENAI_ACCOUNT_REAUTH_UNAVAILABLE');
   return found;
  }
  const latest=await latestCredentials(store),synthetic=accountFromCredentials(latest?.credentials,now());
  if(synthetic?.id===accountId){
   if(!CLIENT_ID.test(synthetic.clientId||'')||synthetic.issuer!==ISSUER||typeof synthetic.subject!=='string'||!synthetic.subject)throw fail(409,'OPENAI_ACCOUNT_REAUTH_UNAVAILABLE');
   return synthetic;
  }
  throw fail(404,'OPENAI_ACCOUNT_NOT_FOUND');
 }
 function authorizationUrl({clientId,mode,account,host,state,nonce,verifier}){
  const params=new URLSearchParams({client_id:clientId,ext_agent_host_id:host,response_type:'code',redirect_uri:REDIRECT_URI,scope:SCOPES,resource:RESOURCE,state,nonce,code_challenge_method:'S256',code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url')});
  if(mode==='add')params.set('agent_name_hint',APPLICATION);
  else{
   if(account.idTokenHint)params.set('id_token_hint',account.idTokenHint);
   if(typeof account.email==='string'&&account.email)params.set('login_hint',account.email);
  }
  return ISSUER+'/api/accounts/authorize?'+params;
 }
 async function begin(input){
  if(!exact(input,['mode','accountId'])||!['add','reauthorize'].includes(input?.mode))throw fail(400,'OPENAI_AUTHORIZATION_REQUEST_INVALID');
  let account=null,clientId='dynamic_agent_client';
  if(input.mode==='reauthorize'){
   if(typeof input.accountId!=='string')throw fail(400,'OPENAI_ACCOUNT_ID_INVALID');
   account=await knownAccount(input.accountId);clientId=account.clientId;
  }else if(input.accountId!==undefined)throw fail(400,'OPENAI_AUTHORIZATION_REQUEST_INVALID');
  const host=account&&HOST_ID.test(account.hostId||'')?account.hostId:await hostId(),latest=await latestCredentials(store),beginRevision=latest?.revision||0,beginActiveId=accountIdFor(latest?.credentials);
  for(let tries=0;tries<3;tries++){
   const id=crypto.randomUUID(),ticket=random(32),state=random(32),nonce=random(32),verifier=random(32),createdAt=now(),expiresAt=createdAt+ATTEMPT_TTL;
   const value={schema:1,id,mode:input.mode,accountId:account?.id||null,clientId,ticketHash:hash(ticket),state,nonce,verifier,redirectUri:REDIRECT_URI,authorizationUrl:authorizationUrl({clientId,mode:input.mode,account,host,state,nonce,verifier}),hostId:host,beginRevision,beginActiveId,expected:account?{issuer:account.issuer,clientId:account.clientId,subject:account.subject}:null,createdAt,expiresAt};
   const created=await createOnce(store,attemptBase(id)+'attempt.json',value);
   if(created?.id===id&&created?.ticketHash===value.ticketHash)return {id,expiresAt,launchUrl:ASSISTANT_ORIGIN+'/#id='+encodeURIComponent(id)+'&ticket='+encodeURIComponent(ticket)};
  }
  throw fail(503,'OPENAI_AUTHORIZATION_UNAVAILABLE');
 }
 async function getAttempt(id){
  if(!UUID.test(id||''))throw fail(400,'OPENAI_AUTHORIZATION_ID_INVALID');
  const value=await record(store,attemptBase(id)+'attempt.json');
  if(!value)throw fail(404,'OPENAI_AUTHORIZATION_NOT_FOUND');
  return value;
 }
 async function accounts(){
  const latest=await latestCredentials(store),activeId=accountIdFor(latest?.credentials),registry=await latestRegistry(store),map=new Map();
  for(const account of registry.accounts)if(account&&ACCOUNT_ID.test(account.id||'')&&accountIdFor({issuer:account.issuer,client_id:account.clientId,subject:account.subject})===account.id)map.set(account.id,account);
  if(activeId&&map.has(activeId)){
   const current=map.get(activeId),email=typeof latest.credentials.email==='string'?latest.credentials.email:current.email;
   map.set(activeId,{...current,email,emailMasked:current.emailMasked||maskEmail(email),...(Number.isFinite(latest.credentials.expires_at)?{accessExpiresAt:latest.credentials.expires_at}:{})});
  }
  if(activeId&&!map.has(activeId)){const synthetic=accountFromCredentials(latest.credentials,now());if(synthetic)map.set(activeId,synthetic);}
  const list=[...map.values()].map(account=>publicAccount(account,activeId));
  const terminal=latest?.revision?await record(store,PREFIX+'renewals/'+String(latest.revision+1).padStart(10,'0')+'/terminal.json'):null;
  if(terminal)for(const account of list)if(account.active)account.status='reauthorize';
  list.sort((a,b)=>(b.active-a.active)||((b.authorizedAt||0)-(a.authorizedAt||0)));
  return {enabled:enabled(env),activeId,accounts:list,helper:{origin:ASSISTANT_ORIGIN,download:'./tools/openai-auth-assistant.cjs',launcherDownload:'./assets/downloads/jianwei-auth-helper-macos.zip'},automaticRefresh:!terminal};
 }
 async function claim(input){
  if(!exact(input,['id','ticket','redirectUri'])||!TICKET.test(input?.ticket||''))throw fail(400,'OPENAI_AUTHORIZATION_REQUEST_INVALID');
  const attempt=await getAttempt(input.id);
  if(!equal(hash(input.ticket),attempt.ticketHash))throw fail(403,'OPENAI_AUTHORIZATION_TICKET_INVALID');
  if(input.redirectUri!==REDIRECT_URI)throw fail(400,'OPENAI_AUTHORIZATION_REDIRECT_INVALID');
  const derived=await derive(attempt);
  if(derived.status==='complete')throw fail(409,'OPENAI_AUTHORIZATION_ALREADY_COMPLETE');
  if(derived.status==='cancelled')throw fail(410,'OPENAI_AUTHORIZATION_CANCELLED');
  if(derived.status==='failed')throw fail(410,derived.error||'OPENAI_AUTHORIZATION_FAILED');
  if(derived.status==='expired')throw fail(410,'OPENAI_AUTHORIZATION_EXPIRED');
  if(derived.status!=='waiting')throw fail(409,'OPENAI_AUTHORIZATION_IN_PROGRESS');
  return {authorizationUrl:attempt.authorizationUrl,expiresAt:attempt.expiresAt};
 }
 async function derive(attempt){
  const base=attemptBase(attempt.id),finalized=await record(store,base+'finalized.json');
  if(finalized)return {status:'complete'};
  if(await record(store,base+'cancelled.json'))return {status:'cancelled'};
  const candidate=await record(store,base+'candidate.json'),failure=await record(store,base+'failure.json');
  if(failure&&!(failure.error==='OPENAI_AUTHORIZATION_UNCERTAIN'&&candidate))return {status:'failed',error:failure.error||'OPENAI_AUTHORIZATION_FAILED'};
  if(candidate||await record(store,base+'activation.json'))return {status:'exchanging'};
  const lock=await record(store,base+'exchange.json');
  if(lock){if(now()-Number(lock.at||0)>EXCHANGE_GRACE)return {status:'failed',error:'OPENAI_AUTHORIZATION_UNCERTAIN'};return {status:'exchanging'};}
  if(now()>=attempt.expiresAt)return {status:'expired'};
  return {status:'waiting'};
 }
 async function verifyCandidate(attempt,candidate){
  const token=candidate.token,clientId=candidate.clientId;
  if(!token||typeof token!=='object'||typeof token.access_token!=='string'||token.access_token.length<=10||typeof token.refresh_token!=='string'||token.refresh_token.length<=10||typeof token.id_token!=='string'||token.id_token.length<=10||!Number.isFinite(token.expires_in)||token.expires_in<=0)throw fail(502,'OPENAI_AUTHORIZATION_TOKEN_INVALID');
  if(token.client_id!==undefined&&token.client_id!==clientId)throw fail(400,'OPENAI_AUTHORIZATION_CLIENT_MISMATCH');
  if(attempt.mode==='reauthorize'&&clientId!==attempt.expected?.clientId)throw fail(400,'OPENAI_AUTHORIZATION_CLIENT_MISMATCH');
  if(attempt.mode==='add'&&!CLIENT_ID.test(clientId))throw fail(400,'OPENAI_AUTHORIZATION_CLIENT_MISMATCH');
  const claims=await verifyToken(token.id_token,{clientId,nonce:attempt.nonce,subject:attempt.expected?.subject,issuer:attempt.expected?.issuer||ISSUER,at:now()});
  const scopes=scopesFrom(token.scope);
  if(!REQUIRED_SCOPES.every(scope=>scopes.includes(scope)))throw fail(400,'OPENAI_AUTHORIZATION_SCOPE_MISSING');
  if(attempt.mode==='reauthorize'&&claims.sub!==attempt.expected?.subject)throw fail(409,'OPENAI_AUTHORIZATION_IDENTITY_MISMATCH');
  const id=accountIdFor({issuer:claims.iss,client_id:clientId,subject:claims.sub});
  if(!id||attempt.mode==='reauthorize'&&id!==attempt.accountId)throw fail(409,'OPENAI_AUTHORIZATION_IDENTITY_MISMATCH');
  const claimedHost=claims.ext_agent_host_id;
  if(claimedHost!==undefined&&(typeof claimedHost!=='string'||!HOST_ID.test(claimedHost)||claimedHost.toLowerCase()!==attempt.hostId.toLowerCase()))throw fail(409,'OPENAI_AUTHORIZATION_IDENTITY_MISMATCH');
  const email=typeof claims.email==='string'?claims.email:null,masked=maskEmail(email),authorizedAt=candidate.at,accessExpiresAt=candidate.at+token.expires_in*1000;
  return {id,label:safeLabel(claims.name,masked,id),emailMasked:masked,email,issuer:claims.iss,clientId,subject:claims.sub,idTokenHint:token.id_token,hostId:claimedHost||attempt.hostId,authorizedAt,accessExpiresAt,reauthReady:true};
 }
 function credentialsFrom(candidate,account){
  const token=candidate.token;
  return {application:APPLICATION,issuer:account.issuer,subject:account.subject,email:account.email||null,client_id:account.clientId,ext_agent_host_id:account.hostId,id_token:token.id_token,access_token:token.access_token,refresh_token:token.refresh_token,token_type:token.token_type||'Bearer',scopes:scopesFrom(token.scope),expires_at:account.accessExpiresAt,earliest_refresh_at:earliestRefreshAt(token.earliest_refresh_at),saved_at:new Date(candidate.at).toISOString()};
 }
 async function upsertRegistry(account){
  for(let tries=0;tries<8;tries++){
   const current=await latestRegistry(store),map=new Map(current.accounts.filter(item=>item&&ACCOUNT_ID.test(item.id||'')&&accountIdFor({issuer:item.issuer,client_id:item.clientId,subject:item.subject})===item.id).map(item=>[item.id,item])),previous=map.get(account.id);
   map.set(account.id,previous?{...previous,...account,email:account.email||previous.email||null,emailMasked:account.emailMasked||previous.emailMasked||null,label:account.label||previous.label,idTokenHint:account.idTokenHint||previous.idTokenHint||null,hostId:account.hostId||previous.hostId||null}:account);
   const next={revision:current.revision+1,accounts:[...map.values()]};
   if(await store.create(registryKey(next.revision),next))return next;
  }
  throw Error('OPENAI_AUTHORIZATION_STORE_BUSY');
 }
 async function savePrevious(attempt,account){
  const latest=await latestCredentials(store),currentId=accountIdFor(latest?.credentials);
  if(currentId!==attempt.beginActiveId&&currentId!==account.id)throw fail(409,'OPENAI_AUTHORIZATION_CONFLICT');
  if(!currentId||currentId===account.id)return;
  const previous=accountFromCredentials(latest.credentials,attempt.createdAt);
  if(previous)await upsertRegistry(previous);
 }
 async function activate(attempt,account){
  const credentials=credentialsFrom(await record(store,attemptBase(attempt.id)+'candidate.json'),account);
  if(!validCredentials(credentials))throw fail(502,'OPENAI_AUTHORIZATION_TOKEN_INVALID');
  for(let tries=0;tries<8;tries++){
   const latest=await latestCredentials(store),currentId=accountIdFor(latest?.credentials);
   if(currentId!==attempt.beginActiveId){
    if(currentId===account.id&&latest?.revision)return {revision:latest.revision,accountId:account.id,activatedAt:now(),reused:true};
    throw fail(409,'OPENAI_AUTHORIZATION_CONFLICT');
   }
   const revision=(latest?.revision||0)+1,value={revision,credentials};
   if(await store.create(versionKey(revision),value))return {revision,accountId:account.id,activatedAt:now()};
  }
  throw Error('OPENAI_AUTHORIZATION_STORE_BUSY');
 }
 async function markFailure(attempt,error){
  return (await createOnce(store,attemptBase(attempt.id)+'failure.json',{error,at:now()}))||{error};
 }
 async function recover(attempt){
  const base=attemptBase(attempt.id);
  if(await record(store,base+'finalized.json'))return {status:'complete'};
  if(await record(store,base+'cancelled.json'))return {status:'cancelled'};
  const candidate=await record(store,base+'candidate.json'),failure=await record(store,base+'failure.json');
  if(failure&&!(failure.error==='OPENAI_AUTHORIZATION_UNCERTAIN'&&candidate))return {status:'failed',error:failure.error||'OPENAI_AUTHORIZATION_FAILED'};
  if(!candidate){
   const lock=await record(store,base+'exchange.json');
   if(lock){if(now()-Number(lock.at||0)>EXCHANGE_GRACE)return {status:'failed',error:'OPENAI_AUTHORIZATION_UNCERTAIN'};return {status:'exchanging'};}
   return null;
  }
  let account=await record(store,base+'verified.json');
  if(!account){
   if(now()>=attempt.expiresAt){await markFailure(attempt,'OPENAI_AUTHORIZATION_EXPIRED');return {status:'expired',error:'OPENAI_AUTHORIZATION_EXPIRED'};}
   try{account=await verifyCandidate(attempt,candidate);}
   catch(error){
    if(error.message==='OPENAI_AUTH_TEMPORARY')return {status:'exchanging'};
    const safe=error.code&&/^OPENAI_[A-Z0-9_]+$/.test(error.code)?error.code:typeof error.message==='string'&&/^OPENAI_[A-Z0-9_]+$/.test(error.message)?error.message:'OPENAI_AUTHORIZATION_IDENTITY_INVALID';
    await markFailure(attempt,safe);return {status:'failed',error:safe};
   }
   account=(await createOnce(store,base+'verified.json',account))||await record(store,base+'verified.json');
   if(!account)return {status:'exchanging'};
  }
  try{await savePrevious(attempt,account);}
  catch(error){
   if(error.code==='OPENAI_AUTHORIZATION_CONFLICT'){await markFailure(attempt,error.code);return {status:'failed',error:error.code};}
   if(error.message==='STORE_UNAVAILABLE'||error.message==='OPENAI_AUTHORIZATION_STORE_BUSY')return {status:'exchanging'};
   throw error;
  }
  let activation=await record(store,base+'activation.json');
  if(!activation){
   try{activation=(await createOnce(store,base+'activation.json',await activate(attempt,account)))||await record(store,base+'activation.json');}
   catch(error){
    if(error.code==='OPENAI_AUTHORIZATION_CONFLICT'){await markFailure(attempt,error.code);return {status:'failed',error:error.code};}
    if(error.message==='STORE_UNAVAILABLE'||error.message==='OPENAI_AUTHORIZATION_STORE_BUSY')return {status:'exchanging'};
    if(error.code&&/^OPENAI_[A-Z0-9_]+$/.test(error.code)){await markFailure(attempt,error.code);return {status:'failed',error:error.code};}
    throw error;
   }
   if(!activation)return {status:'exchanging'};
  }
  try{await upsertRegistry(account);}
  catch(error){if(error.message==='STORE_UNAVAILABLE'||error.message==='OPENAI_AUTHORIZATION_STORE_BUSY')return {status:'exchanging'};throw error;}
  const finalized=await createOnce(store,base+'finalized.json',{at:now(),accountId:account.id});
  if(!finalized)return {status:'exchanging'};
  return {status:'complete'};
 }
 function response(attempt,result){return {id:attempt.id,status:result.status,expiresAt:attempt.expiresAt,...(result.error?{error:result.error}:{})};}
 async function status(id){
  const attempt=await getAttempt(id),recovered=await recover(attempt);
  if(recovered)return response(attempt,recovered);
  return response(attempt,await derive(attempt));
 }
 async function cancel(id){
  const attempt=await getAttempt(id),base=attemptBase(id),state=await derive(attempt);
  if(state.status==='complete')throw fail(409,'OPENAI_AUTHORIZATION_ALREADY_COMPLETE');
  if(state.status==='cancelled'||state.status==='expired'||state.status==='failed')return response(attempt,state);
  if(state.status!=='waiting')throw fail(409,'OPENAI_AUTHORIZATION_IN_PROGRESS');
  if(!await createOnce(store,base+'cancelled.json',{at:now()}))return response(attempt,{status:'cancelled'});
  return response(attempt,{status:'cancelled'});
 }
 async function complete(input){
  if(!exact(input,['id','ticket','state','code','clientId','error'])||!TICKET.test(input?.ticket||'')||typeof input.state!=='string'||input.state.length<16||input.state.length>256||input.code!==undefined&&(typeof input.code!=='string'||!input.code||input.code.length>8192)||input.clientId!==undefined&&typeof input.clientId!=='string'||input.error!==undefined&&(typeof input.error!=='string'||input.error.length>200))throw fail(400,'OPENAI_AUTHORIZATION_REQUEST_INVALID');
  const attempt=await getAttempt(input.id);
  if(!equal(hash(input.ticket),attempt.ticketHash))throw fail(403,'OPENAI_AUTHORIZATION_TICKET_INVALID');
  if(!equal(input.state,attempt.state))throw fail(400,'OPENAI_AUTHORIZATION_STATE_INVALID');
  const base=attemptBase(attempt.id),recovered=await recover(attempt);
  if(recovered)return response(attempt,recovered);
  if(await record(store,base+'cancelled.json'))return response(attempt,{status:'cancelled'});
  if(input.error!==undefined&&input.code!==undefined)throw fail(400,'OPENAI_AUTHORIZATION_REQUEST_INVALID');
  if(input.error!==undefined){
   if(input.error==='access_denied'){
    await createOnce(store,base+'cancelled.json',{at:now(),reason:'denied'});
    return response(attempt,{status:'cancelled'});
   }
   const code='OPENAI_AUTHORIZATION_DENIED';await markFailure(attempt,code);return response(attempt,{status:'failed',error:code});
  }
  if(!input.code)throw fail(400,'OPENAI_AUTHORIZATION_CODE_INVALID');
  if(now()>=attempt.expiresAt)return response(attempt,{status:'expired'});
  let clientId=attempt.mode==='reauthorize'?attempt.expected?.clientId:input.clientId;
  if(attempt.mode==='reauthorize'&&input.clientId!==undefined&&input.clientId!==clientId)throw fail(400,'OPENAI_AUTHORIZATION_CLIENT_MISMATCH');
  if(!CLIENT_ID.test(clientId||''))throw fail(400,'OPENAI_AUTHORIZATION_CLIENT_MISSING');
  if(await record(store,base+'candidate.json'))return response(attempt,await recover(attempt));
  const locked=await store.create(base+'exchange.json',{at:now(),clientId});
  if(!locked){
   if(await record(store,base+'candidate.json'))return response(attempt,await recover(attempt));
   const lock=await record(store,base+'exchange.json');
   if(lock&&now()-Number(lock.at||0)>EXCHANGE_GRACE)return response(attempt,{status:'failed',error:'OPENAI_AUTHORIZATION_UNCERTAIN'});
   return response(attempt,{status:'exchanging'});
  }
  if(await record(store,base+'cancelled.json'))return response(attempt,{status:'cancelled'});
  let reply;
  try{
   reply=await network(transport=>transport(TOKEN_URL,{method:'POST',body:new URLSearchParams({grant_type:'authorization_code',client_id:clientId,code:input.code,code_verifier:attempt.verifier,redirect_uri:REDIRECT_URI,resource:RESOURCE}).toString(),headers:{'Content-Type':'application/x-www-form-urlencoded'},timeout:TOKEN_TIMEOUT,deadlineMs:TOKEN_TIMEOUT,maxBytes:128*1024}));
  }catch{
   await markFailure(attempt,'OPENAI_AUTHORIZATION_UNCERTAIN');
   return response(attempt,{status:'failed',error:'OPENAI_AUTHORIZATION_UNCERTAIN'});
  }
  if(!reply||reply.status!==200){
   const code=reply&&(reply.status===429||reply.status>=500)?'OPENAI_AUTHORIZATION_UPSTREAM_UNAVAILABLE':'OPENAI_AUTHORIZATION_REJECTED';
   await markFailure(attempt,code);return response(attempt,{status:'failed',error:code});
  }
  let token;try{token=JSON.parse(reply.body);}catch{
   await markFailure(attempt,'OPENAI_AUTHORIZATION_UNCERTAIN');
   return response(attempt,{status:'failed',error:'OPENAI_AUTHORIZATION_UNCERTAIN'});
  }
  const candidate={at:now(),clientId,token};
  if(!await createOnce(store,base+'candidate.json',candidate))return response(attempt,{status:'exchanging'});
  return response(attempt,await recover(attempt));
 }
 return {accounts,begin,claim,complete,status,cancel,verifyToken,latestCredentials,latestRegistry};
}
module.exports={PREFIX,ASSISTANT_ORIGIN,REDIRECT_URI,ATTEMPT_TTL,accountIdFor,maskEmail,createIdTokenVerifier,createAuthorizationControl};
