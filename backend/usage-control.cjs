'use strict';
const crypto=require('node:crypto');
const dayAt=at=>new Date(at+8*3600000).toISOString().slice(0,10);
const failure=(status,code)=>Object.assign(new Error(code),{status});
function createUsageControl({store,controlStore=store,owner,env=process.env,now=Date.now}){
 const revisionKey=n=>'usage/'+owner+'/revisions/'+String(n).padStart(10,'0')+'.json';
 async function latest(){let low=0,high=1;while(await controlStore.get(revisionKey(high))){low=high;high=high*2+1;}while(high-low>1){const mid=Math.floor((low+high)/2);if(await controlStore.get(revisionKey(mid)))low=mid;else high=mid;}return low?(await controlStore.get(revisionKey(low))).value:{revision:0,limit:(Number.isSafeInteger(Number(env.TRAINING_DAILY_LIMIT??30))&&Number(env.TRAINING_DAILY_LIMIT??30)>=0?Number(env.TRAINING_DAILY_LIMIT??30):30),reset:null,updatedAt:null};}
 const prefixFor=(config,date)=>'budget/'+owner+'/'+date+(config.reset?.date===date?'/reset-'+config.reset.epoch:'');
 async function count(prefix){if(!await store.get(prefix+'/0.json'))return 0;let low=0,high=1;while(await store.get(prefix+'/'+high+'.json')){low=high;high=high*2+1;}while(high-low>1){const mid=Math.floor((low+high)/2);if(await store.get(prefix+'/'+mid+'.json'))low=mid;else high=mid;}return high;}
 async function state(){const config=await latest(),date=dayAt(now()),used=await count(prefixFor(config,date));return {revision:config.revision,limit:config.limit,used,remaining:config.limit===0?null:Math.max(0,config.limit-used),date,timezone:'Asia/Shanghai',updatedAt:config.updatedAt,resetAt:config.reset?.date===date?config.reset.at:null};}
 async function apply(input){if(!input||Object.keys(input).some(k=>!['expectedRevision','limit','reset'].includes(k))||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||!Number.isSafeInteger(input.limit)||input.limit<0||input.limit>100000||input.reset!==undefined&&typeof input.reset!=='boolean')throw failure(400,'USAGE_SETTINGS_INVALID');const previous=await latest();if(previous.revision!==input.expectedRevision)throw failure(409,'USAGE_REVISION_CONFLICT');const at=now(),next={revision:previous.revision+1,limit:input.limit,reset:input.reset?{date:dayAt(at),epoch:crypto.randomUUID(),at}:previous.reset,updatedAt:at};if(!await controlStore.create(revisionKey(next.revision),next))throw failure(409,'USAGE_REVISION_CONFLICT');return state();}
 async function reserve(id,at){const receipt='usage-receipts/'+owner+'/'+id+'.json';if(await store.get(receipt))return;const config=await latest(),prefix=prefixFor(config,dayAt(at));
  // Immutable per-request attempts ensure concurrent retries reserve the same
  // slot. Reset starts a new counter epoch without touching accepted jobs.
  for(let attempt=0;attempt<64;attempt++){const pin='usage-attempts/'+owner+'/'+id+'/'+attempt+'.json';let saved=await store.get(pin);if(!saved){const slot=await count(prefix);if(config.limit>0&&slot>=config.limit)throw failure(429,'DAILY_LIMIT');await store.create(pin,{prefix,slot});saved=await store.get(pin);}const target=saved.value,key=target.prefix+'/'+target.slot+'.json';let used=await store.get(key);if(!used){await store.create(key,{id});used=await store.get(key);}if(used?.value.id===id){await store.create(receipt,{prefix:target.prefix,slot:target.slot});return;}}
  throw failure(503,'USAGE_BUSY');
 }
 return {state,apply,reserve};
}
module.exports={createUsageControl,dayAt};
