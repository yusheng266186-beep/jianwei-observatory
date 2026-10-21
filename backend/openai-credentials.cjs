'use strict';
const crypto=require('node:crypto');
const {COSStore}=require('./store.cjs'),{cos}=require('./tencent.cjs');
const {withProxy}=require('./openai-proxy.cjs');
const prefix='openai-siwc/',versionKey=n=>prefix+'credentials/'+String(n).padStart(10,'0')+'.json';
const fail=()=>Error('MODEL_AUTH_FAILED'),pause=ms=>new Promise(r=>setTimeout(r,ms));
function validCredentials(c){return !!c&&c.application==='Jianwei Observatory'&&c.issuer==='https://auth.openai.com'&&typeof c.subject==='string'&&c.subject.length>0&&/^oaiapp_[A-Za-z0-9_-]+$/.test(c.client_id||'')&&/^urn:uuid:[a-f0-9-]{36}$/i.test(c.ext_agent_host_id||'')&&['access_token','refresh_token','id_token'].every(k=>typeof c[k]==='string'&&c[k].length>10)&&Number.isFinite(c.expires_at)&&Array.isArray(c.scopes)&&['resource.invoke','chatgpt.tokens.use.direct'].every(s=>c.scopes.includes(s));}
function secureStore({env=process.env,auth}={}){const store=new COSStore({bucket:env.TRAINING_BUCKET,region:env.TRAINING_REGION||'ap-chengdu',auth,prefix:'training-control-v1/'});return {get:key=>store.get(key),async create(key,value){if(!key.startsWith(prefix)||key.includes('..'))throw Error('OPENAI_CREDENTIAL_KEY_INVALID');const r=await cos(store.host,'/'+store.prefix+key,{method:'PUT',body:JSON.stringify(value),headers:{'Content-Type':'application/json','x-cos-forbid-overwrite':'true','x-cos-server-side-encryption':'AES256'},auth:store.auth});if(r.status===409)return false;if(r.status!==200)throw Error('STORE_UNAVAILABLE');return true;}};}
// Cache only public signing keys. Unknown key IDs trigger a fresh fetch.
let jwksCache={until:0,keys:[]};
async function validateIdentity(token,old,transport,{at=Date.now()}={}){
 let h,c,parts;try{parts=token.split('.');if(parts.length!==3)throw fail();h=JSON.parse(Buffer.from(parts[0],'base64url'));c=JSON.parse(Buffer.from(parts[1],'base64url'));}catch{throw fail();}
 if(h.alg!=='RS256'||!h.kid)throw fail();
 let jwk=jwksCache.until>Date.now()?jwksCache.keys.find(k=>k.kid===h.kid):null;
 if(!jwk){const r=await transport('https://auth.openai.com/.well-known/jwks.json',{timeout:20000,deadlineMs:20000,maxBytes:128*1024});if(r.status!==200)throw Error('OPENAI_AUTH_TEMPORARY');let keys;try{keys=JSON.parse(r.body).keys;if(!Array.isArray(keys))throw Error();}catch{throw Error('OPENAI_AUTH_TEMPORARY');}jwksCache={until:Date.now()+300000,keys};jwk=keys.find(k=>k.kid===h.kid);}
 if(!jwk||jwk.use&&jwk.use!=='sig'||jwk.alg&&jwk.alg!=='RS256')throw fail();
 const key=crypto.createPublicKey({key:jwk,format:'jwk'});at/=1000;
 if(!crypto.verify('sha256',Buffer.from(parts[0]+'.'+parts[1]),key,Buffer.from(parts[2],'base64url'))||c.iss!==old.issuer||c.sub!==old.subject||!(Array.isArray(c.aud)?c.aud.includes(old.client_id):c.aud===old.client_id)||!Number.isFinite(c.exp)||c.exp<=at||c.nbf!==undefined&&(!Number.isFinite(c.nbf)||c.nbf>at+30)||c.iat!==undefined&&(!Number.isFinite(c.iat)||c.iat>at+30)||Array.isArray(c.aud)&&c.aud.length>1&&c.azp!==old.client_id)throw fail();return c;
}
const pathFor=(revision,suffix)=>prefix+'renewals/'+String(revision).padStart(10,'0')+'/'+suffix+'.json';
function createSession({store,network=withProxy,now=Date.now,sleep=pause,verify=validateIdentity}={}){
 let hint=0,pending=null,inflight=null;
 async function latest(){let low=hint,high=hint+1;while(await store.get(versionKey(high))){low=high;high=high*2+1;}while(high-low>1){const mid=Math.floor((low+high)/2);if(await store.get(versionKey(mid)))low=mid;else high=mid;}hint=low;const record=low?(await store.get(versionKey(low)))?.value:null;if(!record||!validCredentials(record.credentials))throw fail();return record;}
 async function savePending(){if(!pending)return;const value=pending,key=pathFor(value.revision,'candidate');if(!await store.create(key,value)){const saved=(await store.get(key))?.value;if(saved?.credentials?.access_token!==value.credentials.access_token)throw fail();}pending=null;}
 async function promote(candidate,old){
  // A rotated token set is durable BEFORE remote JWKS validation. Temporary
  // validation/storage failures resume this checkpoint, never spend the old refresh token again.
  if(candidate.credentials.id_token!==old.credentials.id_token)await network(t=>verify(candidate.credentials.id_token,old.credentials,t,{at:Math.min(now(),Date.parse(candidate.credentials.saved_at)||now())}));
  if(!validCredentials(candidate.credentials))throw fail();
  if(!await store.create(versionKey(candidate.revision),candidate)){const saved=(await store.get(versionKey(candidate.revision)))?.value;if(saved?.credentials?.access_token!==candidate.credentials.access_token)throw fail();}
  hint=candidate.revision;return candidate.credentials;
 }
 async function tokenOnce({rejectedToken}={}){
  await savePending();const old=await latest(),c=old.credentials,at=now();
  const forced=rejectedToken===c.access_token;
  if(await store.get(pathFor(old.revision+1,'terminal')))throw fail();
  if(!forced&&c.expires_at>at+120000)return c;
  const fallback=(uncertain=false)=>{if(!forced&&c.expires_at>now()+5000)return c;if(uncertain)throw Object.assign(fail(),{diagnostic:{kind:'authorization',code:'OPENAI_REFRESH_UNCERTAIN'}});throw Error('OPENAI_AUTH_TEMPORARY');};
  if((Number(c.earliest_refresh_at)||0)>at)return fallback();
  const next=old.revision+1,candidateKey=pathFor(next,'candidate');
  // Pre-v2 locks may represent an already-rotated token whose response was lost.
  // Never steal them or blindly replay a rotating refresh token.
  if(await store.get(prefix+'refresh/'+String(next).padStart(10,'0')+'.json')){
   const current=await latest();if(current.revision>old.revision)return current.credentials;return fallback(true);
  }
  for(let wait=0;wait<65;wait++){
   const candidate=(await store.get(candidateKey))?.value;if(candidate){try{const value=await promote(candidate,old);return value.expires_at>now()+120000?value:tokenOnce();}catch(e){if(e.message==='MODEL_AUTH_FAILED')throw e;return fallback();}}
   const current=await latest();if(current.revision>old.revision)return current.credentials;
   let attempt=0;while(await store.get(pathFor(next,'attempt-'+attempt+'/outcome')))attempt++;
   const prior=attempt?(await store.get(pathFor(next,'attempt-'+(attempt-1)+'/outcome')))?.value:null;
   if(prior?.kind==='terminal')throw fail();
   if(prior?.kind==='uncertain')return fallback(true);
   if(prior?.retryAt>now())return fallback();
   const lock=pathFor(next,'attempt-'+attempt+'/lock');
   if(await store.create(lock,{at:now(),owner:crypto.randomUUID()})){
    let received=false;
    try{
     const fresh=await network(async transport=>{
      const r=await transport('https://auth.openai.com/api/accounts/oauth/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:c.client_id,refresh_token:c.refresh_token,resource:'https://api.openai.com/v1'}).toString(),headers:{'Content-Type':'application/x-www-form-urlencoded'},timeout:25000,deadlineMs:25000,maxBytes:128*1024});
      received=true;let v;try{v=JSON.parse(r.body);}catch{throw Object.assign(Error('OPENAI_AUTH_TEMPORARY'),{uncertain:r.status===200});}
      if(r.status!==200){const code=typeof v.error==='string'?v.error:v.error?.code;const terminal=['invalid_grant','invalid_refresh_token','token_expired','refresh_token_expired','refresh_token_invalidated','refresh_token_reused','invalid_client'].includes(code);throw Object.assign(Error(terminal?'MODEL_AUTH_FAILED':'OPENAI_AUTH_TEMPORARY'),{terminal,uncertain:![429,500,502,503,504].includes(r.status)&&!terminal});}
      if(typeof v.access_token!=='string'||typeof v.refresh_token!=='string'||!Number.isFinite(v.expires_in)||v.expires_in<=0)throw Object.assign(Error('OPENAI_AUTH_TEMPORARY'),{uncertain:true});
      let earliest=Number(v.earliest_refresh_at)||Date.parse(v.earliest_refresh_at)||0;if(earliest&&earliest<1e12)earliest*=1000;
      const fresh={...c,...(v.id_token?{id_token:v.id_token}:{}),access_token:v.access_token,refresh_token:v.refresh_token,scopes:typeof v.scope==='string'?v.scope.split(/\s+/):c.scopes,expires_at:now()+v.expires_in*1000,earliest_refresh_at:earliest,saved_at:new Date(now()).toISOString()};
      if(!validCredentials(fresh))throw Object.assign(fail(),{terminal:true});return fresh;
     });
     pending={revision:next,credentials:fresh};await savePending();return await promote({revision:next,credentials:fresh},old);
    }catch(e){
     if(pending)throw Error('STORE_UNAVAILABLE');
     if(await store.get(candidateKey)){if(e.message==='MODEL_AUTH_FAILED')throw e;return fallback();}
     // Only explicit temporary rejection permits a later retry. A lost response
     // could already have rotated the credential and is never automatically replayed.
     const preSend=e.message==='OPENAI_PROXY_START_FAILED'||e.diagnostic?.kind==='network'&&e.diagnostic.requestFinished===false&&e.diagnostic.responseHeadersReceived===false&&!e.diagnostic.responseBytes;
     const kind=e.terminal?'terminal':e.uncertain||!received&&!preSend?'uncertain':'temporary';
     await store.create(pathFor(next,'attempt-'+attempt+'/outcome'),{kind,at:now(),...(kind==='temporary'?{retryAt:now()+5000}:{})});
     if(kind==='terminal'){await store.create(pathFor(next,'terminal'),{at:now(),reason:'reauthorization-required'});throw fail();}if(kind==='temporary'&&attempt<1){await sleep(5000);continue;}return fallback(kind==='uncertain');
    }
   }
   await sleep(600);
  }
  return fallback();
 }
 async function token(options){if(inflight){const value=await inflight;if(options?.rejectedToken===value.access_token)return token(options);return value;}inflight=tokenOnce(options).finally(()=>{inflight=null;});return inflight;}
 return {token,latest};
}
let session;
function credentials(options){session||=createSession({store:secureStore()});return session.token(options);}
module.exports={prefix,versionKey,validCredentials,secureStore,validateIdentity,createSession,credentials};
