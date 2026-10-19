'use strict';
// Private checkpoint for an already generated bitmap. The record contains the
// signed upstream URL (or the returned base64 payload) and is stored only in
// the private job prefix. Never copy any field of this record into public
// results, progress, logs or error messages.
const crypto=require('node:crypto');
const OWNER=/^[a-f0-9]{32}$/,JOB=/^[a-f0-9]{8}-[a-f0-9]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[a-f0-9]{12}$/;
const MAX_SLOTS=32;
const hash=value=>crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const failure=(code,diagnostic)=>Object.assign(new Error(code),diagnostic?{diagnostic}:{});

// The fingerprint binds a candidate to the semantic generation request. A
// caller may pass a descriptor (for example {questionId,attempt}) to keep
// intentional redraws separate; diagram/layout/model/provider are always
// included so an edited brief can never reuse an older bitmap.
function requestFingerprint({diagram,layout,provider,model,request}={}){
 return hash({request:request===undefined?null:request,caption:diagram?.caption,description:diagram?.description,layout:layout?{width:layout.width,aspect:layout.aspect}:null,provider,model});
}
function parseJobKey(value){
 const match=typeof value==='string'?/^jobs\/([a-f0-9]{32})\/([a-f0-9-]+)$/.exec(value):null;
 if(!match||!JOB.test(match[2]))throw failure('IMAGE_CANDIDATE_CONTEXT_INVALID');
 return {owner:match[1],job:match[2]};
}
function context({store,owner,job,jobKey,request,provider,model,diagram,layout}={}){
 if(!store)return null;
 // Accept either owner+job, jobKey, or a full jobs/... key in job.
 if(jobKey===undefined&&typeof job==='string'&&job.startsWith('jobs/')){jobKey=job;job=undefined;}
 if(jobKey!==undefined){
  const parsed=parseJobKey(jobKey);
  if(owner!==undefined&&owner!==parsed.owner||job!==undefined&&job!==parsed.job)throw failure('IMAGE_CANDIDATE_CONTEXT_INVALID');
  owner=parsed.owner;job=parsed.job;
 }
 if(!OWNER.test(owner||'')||!JOB.test(job||'')||typeof provider!=='string'||!provider||typeof model!=='string'||!model)throw failure('IMAGE_CANDIDATE_CONTEXT_INVALID');
 return {store,owner,job,provider,model,request:requestFingerprint({diagram,layout,provider,model,request})};
}
const base=ctx=>'jobs/'+ctx.owner+'/'+ctx.job+'/image-candidates/'+ctx.request;
const slotKey=(ctx,slot)=>base(ctx)+'/'+slot+'.json';
const unusableKey=(ctx,slot)=>base(ctx)+'/'+slot+'.unusable.json';
const storeFailure=stage=>failure('IMAGE_CANDIDATE_STORE_FAILED',{kind:'image-candidate',stage});
async function get(store,key){try{return await store.get(key);}catch{throw storeFailure('read');}}
function validateRecord(value,ctx){
 if(!value||value.v!==1||value.owner!==ctx.owner||value.job!==ctx.job||value.request!==ctx.request||value.provider!==ctx.provider||value.model!==ctx.model)throw failure('IMAGE_CANDIDATE_BINDING_MISMATCH');
 if(value.source==='url'){if(typeof value.url!=='string'||!value.url)throw failure('IMAGE_CANDIDATE_INVALID');}
 else if(value.source==='data'){if(typeof value.data!=='string'||!value.data||typeof value.mime!=='string')throw failure('IMAGE_CANDIDATE_INVALID');}
 else throw failure('IMAGE_CANDIDATE_INVALID');
 return value;
}
async function latest(ctx){
 let found=null;
 for(let slot=0;slot<MAX_SLOTS;slot++){
  const saved=await get(ctx.store,slotKey(ctx,slot));
  if(!saved)break;
  const marker=await get(ctx.store,unusableKey(ctx,slot));
  found={slot,record:validateRecord(saved.value,ctx),unusable:marker?.value||null};
 }
 return found;
}
async function save(ctx,{source,url,data,mime},{regenerate=false,now=Date.now}={}){
 const current=await latest(ctx);
 if(current&&!regenerate)return {slot:current.slot,record:current.record,created:false,unusable:current.unusable};
 const slot=current?current.slot+1:0;
 if(slot>=MAX_SLOTS)throw failure('IMAGE_CANDIDATE_LIMIT');
 const record={v:1,owner:ctx.owner,job:ctx.job,request:ctx.request,provider:ctx.provider,model:ctx.model,source,createdAt:now(),...(source==='url'?{url}:{data,mime})};
 try{
  if(await ctx.store.create(slotKey(ctx,slot),record))return {slot,record,created:true};
  const winner=await get(ctx.store,slotKey(ctx,slot));
  if(!winner)throw storeFailure('write');
  return {slot,record:validateRecord(winner.value,ctx),created:false};
 }catch(error){
  if(error.diagnostic?.kind==='image-candidate')throw error;
  throw storeFailure('write');
 }
}
// Best-effort marker only: if this write fails the next resume will attempt the
// same download again, which still cannot call the paid generation endpoint.
async function markUnusable(ctx,slot,{reason='CANDIDATE_UNUSABLE',status,attempts,now=Date.now()}={}){
 try{await ctx.store.create(unusableKey(ctx,slot),{reason:String(reason).slice(0,64),...(Number.isInteger(status)?{status}:{}),...(Number.isInteger(attempts)?{attempts}:{}),at:now});}catch{}
}
const reasonText=value=>/^(?:HTTP_\d{3}|[A-Z_]{1,32})$/.test(String(value||''))?String(value):'CANDIDATE_UNUSABLE';
const tokenText=value=>typeof value==='string'&&/^[A-Za-z0-9._-]{1,64}$/.test(value)?value:'unknown';
function status(found){
 if(!found)return {exists:false};
 return {exists:true,slot:found.slot,source:found.record.source,provider:tokenText(found.record.provider),model:tokenText(found.record.model),createdAt:Number.isFinite(found.record.createdAt)?found.record.createdAt:null,unusable:found.unusable?reasonText(found.unusable.reason):null};
}
function expiredError(found){
 const error=failure('IMAGE_CANDIDATE_EXPIRED',{kind:'image-candidate',state:'expired',...(Number.isInteger(found?.unusable?.status)?{status:found.unusable.status}:{}),...(Number.isInteger(found?.unusable?.attempts)?{attempts:found.unusable.attempts}:{}),reason:reasonText(found?.unusable?.reason)});
 return error;
}
module.exports={context,latest,save,markUnusable,status,expiredError,requestFingerprint,storeFailure,slotKey,base};
