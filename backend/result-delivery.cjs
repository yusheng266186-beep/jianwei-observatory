'use strict';
// Private, immutable delivery checkpoints. Retrying a COS write must never
// replay a paid model call. A lost PUT acknowledgement is resolved by GET.
const {isDeepStrictEqual}=require('node:util');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const transient=e=>['STORE_UNAVAILABLE','ECONNRESET','EPIPE','ETIMEDOUT','NETWORK_TIMEOUT','NETWORK_INTERRUPTED'].includes(e?.code||e?.message);
const pending=cause=>Object.assign(Error('RESULT_SAVE_PENDING'),{cause});
// COS JSON round-trips drop undefined object members. Persist and compare the
// JSON-serializable snapshot so a successful write is never mistaken for a
// conflicting value. This is storage framing only; teaching text is unchanged.
const snapshot=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
// Repeated delivery/aggregate snapshots can recompute only wall-clock metadata.
// The first immutable ready result remains authoritative; content still has to
// match byte-for-byte after the JSON snapshot.
const stable=value=>{const copy=snapshot(value);if(copy&&typeof copy==='object'&&!Array.isArray(copy)&&copy.status==='ready'){delete copy.generatedAt;delete copy.finishedAt;}return copy;};
const same=(a,b)=>isDeepStrictEqual(stable(a),stable(b));
const storageFailure=error=>error?.message==='RESULT_SAVE_PENDING'||transient(error);
async function active(store,key,job){
 if(await store.get(key+'/removed.json'))throw Error('JOB_CANCELLED');
 for(const id of [job?.group?.parentId,job?.input?.sourceId,job?.figure?.parentId,job?.repair?.parentId,job?.review?.parentId])if(id&&await store.get(key.slice(0,key.lastIndexOf('/')+1)+id+'/removed.json'))throw Error('JOB_CANCELLED');
}
async function createVerified(store,key,value,{check=async()=>{},wait=pause}={}){
 const payload=snapshot(value);let failure;
 for(let attempt=0;attempt<3;attempt++){
  try{await check();if(await store.create(key,payload)){await check();return payload;}}catch(e){if(!transient(e))throw e;failure=e;}
  try{const saved=await store.get(key);if(saved){await check();if(!same(saved.value,payload))throw Error('JOB_RESULT_CONFLICT');return saved.value;}}catch(e){if(!transient(e))throw e;failure=e;}
  if(attempt<2)await wait([100,400][attempt]);
 }
 throw pending(failure);
}
async function checkpoint(store,key,job,result,{stage='ready',now=Date.now,wait}={}){
 const path=key+'/delivery-candidate.json';let old;
 for(let n=0;n<3;n++)try{old=await store.get(path);break;}catch(e){if(!transient(e))throw e;if(n===2)throw pending(e);await (wait||pause)([100,400][n]);}
 if(old){try{await active(store,key,job);}catch(e){if(transient(e))throw pending(e);throw e;}if(old.value.stage!==stage||!same(old.value.result,result))throw Error('JOB_RESULT_CONFLICT');return old.value;}
 const value={version:1,stage,result:snapshot(result),createdAt:now()};
 return createVerified(store,path,value,{check:()=>active(store,key,job),wait});
}
async function commit(store,key,job,candidate,{now=Date.now,wait,dispatch}={}){
 await active(store,key,job);
 if(candidate.stage==='content'){
  await require('./content-review.cjs').begin(store.source||store,key,job,candidate.result,{now,dispatch});
  return {status:'running',contentReviewPipeline:true};
 }
 if(candidate.stage==='figures'){
  await require('./figure-pipeline.cjs').begin(store.source||store,key,job,candidate.result,{now,dispatch});
  return {status:'running',figurePipeline:true};
 }
 if(candidate.stage!=='ready'||candidate.result?.status!=='ready')throw Error('JOB_RESULT_CONFLICT');
 const existing=await store.get(key+'/result.json');
 if(existing){await active(store,key,job);if(!same(existing.value,candidate.result))throw Error('JOB_RESULT_CONFLICT');return existing.value;}
 return createVerified(store,key+'/result.json',candidate.result,{check:()=>active(store,key,job),wait});
}
async function save(store,key,job,result,options={}){
 const candidate=await checkpoint(store,key,job,result,options);
 try{return await commit(store,key,job,candidate,options);}catch(e){if(transient(e))throw pending(e);throw e;}
}
async function recover(store,key,job,options={}){
 try{await active(store,key,job);}catch(e){if(e.message==='JOB_CANCELLED')return null;throw e;}
 const candidate=(await store.get(key+'/delivery-candidate.json'))?.value;
 if(!candidate){await recoverQueued(store,key,job,options);return null;}
 if(candidate.version!==1)throw Error('JOB_RESULT_CONFLICT');
 if(candidate.stage==='content'&&await store.get(key+'/content-review-manifest.json'))return {status:'running',contentReviewPipeline:true};
 if(candidate.stage==='figures'&&await store.get(key+'/figure-manifest.json'))return {status:'running',figurePipeline:true};
 try{return await commit(store,key,job,candidate,options);}
 catch(e){if(e.message==='JOB_CANCELLED')return null;if(!transient(e)&&e.message!=='RESULT_SAVE_PENDING')throw e;
  return {status:'running',deliveryPending:true,deadlineAt:(options.now||Date.now)()+930000};}
}
async function recoverQueued(store,key,job,{now=Date.now,dispatch}={}){
 const at=now();if(typeof dispatch!=='function'||!Number.isFinite(job?.createdAt)||!Number.isFinite(job?.deadline)||at-job.createdAt<20000||job.deadline<at)return false;
 const [run,result,removed]=await Promise.all(['run','result','removed'].map(name=>store.get(key+'/'+name+'.json')));if(run||result||removed)return false;
 // Re-dispatch the same immutable job, once per window. The worker's run lock
 // still permits only one paid model call, even after a lost trigger or ack.
 const receipt=key+'/dispatch-recovery/'+Math.floor(at/30000)+'.json';
 if(!await store.create(receipt,{at}))return false;
 try{await dispatch(key);return true;}catch{return false;}
}
module.exports={active,createVerified,checkpoint,commit,save,recover,recoverQueued,storageFailure};
