'use strict';
// Subject review is a separate, durable operation. Formatting repair never gets
// permission to change teaching content; this stage records every such change.
const crypto=require('node:crypto'),delivery=require('./result-delivery.cjs');
const {createProgressWriter}=require('./progress.cjs');
const parentKey=(key,id)=>key.slice(0,key.lastIndexOf('/')+1)+id;
const attemptPath=(key,n)=>key+'/content-attempts/'+String(n).padStart(6,'0')+'.json';
function childId(key,n){const h=crypto.createHash('sha256').update(key+'|content-review|'+n).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);}
async function latest(store,key){let n=0;while(await store.get(attemptPath(key,n+1)))n++;return n;}
async function active(store,key,manifest){await delivery.active(store,key,manifest.job);}
async function ensure(store,key,manifest,n,{now=Date.now,dispatch=async()=>{}}={}){
 await active(store,key,manifest);const id=childId(key,n),child=parentKey(key,id),createdAt=now(),groupContext=manifest.groupContext||manifest.job.groupContext;
 await delivery.createVerified(store,attemptPath(key,n),{id,attempt:n},{check:()=>active(store,key,manifest)});
 if(await store.create(child+'/meta.json',{id,type:'content-review',review:{parentId:key.split('/').at(-1),attempt:n},generation:manifest.job.generation,input:manifest.job.input,...(groupContext?{groupContext}:{}),status:'queued',createdAt,deadline:createdAt+600000}))await dispatch(child);
 return child;
}
async function begin(store,key,job,draft,options={}){
 if(!job.contentReview)return false;
 await delivery.createVerified(store,key+'/content-review-source.json',draft,{check:()=>delivery.active(store,key,job)});
 await delivery.createVerified(store,key+'/content-review-manifest.json',{version:1,job,...(job.groupContext?{groupContext:job.groupContext}:{}),createdAt:job.createdAt},{check:()=>delivery.active(store,key,job)});
 await store.create(key+'/content-review-progress.json',(await store.get(key+'/progress.json'))?.value||{});
 const manifest=(await store.get(key+'/content-review-manifest.json')).value;
 await ensure(store,key,manifest,0,options);return true;
}
async function state(store,key,manifest,options){
 const n=await latest(store,key),child=await ensure(store,key,manifest,n,options),meta=(await store.get(child+'/meta.json'))?.value;
 if(meta)await delivery.recover(store,child,meta,options);
 const result=(await store.get(child+'/result.json'))?.value,progress=(await store.get(child+'/progress.json'))?.value||{},run=(await store.get(child+'/run.json'))?.value;
 const deadlineAt=run?.deadlineAt||meta.deadline+15000;
 return {n,child,result,progress,deadlineAt,status:result?.status||(deadlineAt<options.now()?'failed':run?'running':'queued')};
}
async function publish(store,key,manifest,s,now){
 const source=(await store.get(key+'/content-review-progress.json'))?.value||{},old=(await store.get(key+'/progress.json'))?.value||{};
 if((old.contentRevision||0)>s.n)return;
 await store.progress(key+'/progress.json',{...source,phase:'content-reviewing',contentRevision:s.n,contentStage:{attempt:s.n+1,model:manifest.job.generation.model,status:s.status,...(s.result?.error?{error:s.result.error}:{})},contentOutputText:s.progress.outputText||'',contentThinkingText:s.progress.thinkingText||'',contentSummary:s.progress.summary||'',contentTiming:s.progress.timing,contentChars:s.progress.responseChars||0,measurements:[...require('./job-diagnostics.cjs').progressMeasurements(source,manifest.job.generation.model),...require('./job-diagnostics.cjs').progressMeasurements({timing:s.progress.timing},manifest.job.generation.model).map(p=>({...p,role:'content-review'}))],sequence:(old.sequence||0)+1,heartbeatAt:now(),receivedAt:s.progress.receivedAt||source.receivedAt||now()});
}
async function snapshot(store,key,{now=Date.now,dispatch=async()=>{}}={}){
 const manifest=(await store.get(key+'/content-review-manifest.json'))?.value;if(!manifest||await store.get(key+'/figure-manifest.json'))return null;
 try{await active(store,key,manifest);}catch(e){if(e.message==='JOB_CANCELLED')return null;throw e;}
 const ready=(await store.get(key+'/recovered.json'))?.value||(await store.get(key+'/result.json'))?.value;if(ready?.status==='ready')return ready;
 const s=await state(store,key,manifest,{now,dispatch});await publish(store,key,manifest,s,now);
 if(s.status==='ready'){
  const source=(await store.get(key+'/content-review-source.json')).value,review=s.result;
  const usage={};for(const k of ['input','output','thinking'])usage[k]=(source.usage?.[k]||0)+(review.usage?.[k]||0);
  const result={...source,sheet:review.sheet,usage,contentReview:{version:1,model:review.model||manifest.job.generation.model,provider:manifest.job.generation.provider,changes:review.changes||[],notes:review.notes||[],reviewScope:review.reviewScope||'subject-content',reviewDisclaimer:review.reviewDisclaimer||'模型复核后仍需教师审定。'}};
  if(manifest.job.pipeline===2&&result.sheet.questions.some(q=>q.figureRequest)){
   await require('./figure-pipeline.cjs').begin(store,key,manifest.job,result,{now,dispatch});
   return require('./figure-pipeline.cjs').snapshot(store,key,{now,dispatch});
  }
  const path=await store.get(key+'/result.json')?'/recovered.json':'/result.json';
  await delivery.createVerified(store,key+path,{...result,status:'ready',finishedAt:now()},{check:()=>active(store,key,manifest)});
  const progress=(await store.get(key+'/progress.json'))?.value||{};await store.progress(key+'/progress.json',{...progress,phase:'ready',heartbeatAt:now()});return (await store.get(key+path)).value;
 }
 return {status:s.status==='failed'?'failed':'running',contentReviewPipeline:true,deadlineAt:s.deadlineAt,...(s.status==='failed'?{error:s.result?.error||'JOB_EXPIRED',contentReviewNotes:s.result?.notes||[],resumeAvailable:true,failureDetail:s.result?.failureDetail||'学科复核尚未完成，原始题文已保存；继续时只重试复核，不重新出题。'}:{})};
}
async function resume(store,key,options={}){
 const manifest=(await store.get(key+'/content-review-manifest.json'))?.value;if(!manifest||await store.get(key+'/figure-manifest.json'))return null;
 const current=await snapshot(store,key,options);if(current?.status!=='failed')return current;
 await ensure(store,key,manifest,(await latest(store,key))+1,options);return snapshot(store,key,options);
}
async function runStep(store,key,job,{now=Date.now,dispatch=async()=>{},reviewer=require('./content-check.cjs').reviewContent}={}){
 const parent=parentKey(key,job.review.parentId),manifest=(await store.get(parent+'/content-review-manifest.json'))?.value;if(!manifest)return {skipped:true};
 try{await active(store,parent,manifest);}catch(e){if(e.message==='JOB_CANCELLED')return {cancelled:true};throw e;}
 if(await delivery.recover(store,key,job,{now,dispatch})||await store.get(key+'/result.json'))return {skipped:true};
 if(!await store.create(key+'/run.json',{startedAt:now(),deadlineAt:now()+885000}))return {skipped:true};
 const controller=new AbortController(),proxy={get:n=>n===key+'/removed.json'?active(store,parent,manifest).then(()=>store.get(n)).catch(e=>{if(e.message==='JOB_CANCELLED')return {value:{}};throw e;}):store.get(n),async progress(n,v){await store.progress(n,v);await publish(store,parent,manifest,{n:job.review.attempt,status:'running',progress:v},now);}},progress=createProgressWriter({store:proxy,key,total:manifest.job.input.count,now,controller});await progress.flush();
 try{
  const source=(await store.get(parent+'/content-review-source.json')).value;
  const prior=job.review.attempt>0?(await store.get(parentKey(parent,childId(parent,job.review.attempt-1))+'/diagnostic.json'))?.value:null;
  const formatSource=source.formatRepair?.fidelity?.verified===false?(await store.get(parent+'/format-repair-source.json'))?.value?.output:undefined;
  const groupScope=job.groupContext||manifest.groupContext||manifest.job.groupContext;
  const result=await reviewer(structuredClone(source.sheet),manifest.job.input,{generation:job.generation,separateFigures:manifest.job.pipeline===2,signal:controller.signal,onProgress:progress.update,...(groupScope?{groupScope}:{}),...(prior?{feedback:{notes:prior.notes,detail:prior.detail,validation:prior.validation},candidate:prior.candidate}:{}),...(formatSource?{formatSource}:{})});
  require('./content-check.cjs').validateReviewResult(source.sheet,result);
  await require('./generator.cjs').validateOutput(JSON.stringify(result.sheet),manifest.job.input,{separateFigures:manifest.job.pipeline===2,usage:result.usage,...(groupScope?{groupScope}:{})});
  await active(store,parent,manifest);if(controller.signal.aborted)throw Error('JOB_CANCELLED');
  await progress.flush();await delivery.save(store,key,job,{...result,status:'ready',finishedAt:now()},{now,dispatch});await progress.close('ready');
 }catch(error){
  if(error.message==='JOB_CANCELLED'){await progress.close('removed');return {cancelled:true};}
  if(error.message==='RESULT_SAVE_PENDING'||await store.get(key+'/delivery-candidate.json')){await progress.close('saving');throw error;}
  await progress.close('failed');
  await store.create(key+'/diagnostic.json',{at:now(),category:error.message,validation:error.cause?.message,detail:error.detail,notes:error.notes,...(error.candidate?{candidate:error.candidate}:{}),...(error.output?{raw:String(error.output).slice(0,256000)}:{}),...(error.diagnostic?{upstream:error.diagnostic}:{})});
  const serviceFailures={MODEL_AUTH_FAILED:'学科复核服务鉴权失败，请检查当前模型的凭据或分组权限。',MODEL_RATE_LIMIT:'学科复核服务暂时限流，可稍后继续当前复核。',MODEL_BALANCE_REQUIRED:'学科复核服务余额不足，请检查当前模型账户。',MODEL_NOT_CONFIGURED:'当前出题模型尚未完成服务配置。',MODEL_SUBSCRIPTION_EXPIRED:'当前模型订阅已到期，请检查模型服务。'};
  const code=serviceFailures[error.message]?error.message:['CONTENT_REVIEW_FAILED','CONTENT_REVIEW_INVALID'].includes(error.message)?error.message:'CONTENT_REVIEW_INTERRUPTED';
  const detail=code==='CONTENT_REVIEW_FAILED'?'学科复核发现尚未解决的问题。'+(error.notes||[]).map(n=>'第'+n.questionId+'题：'+(n.reason||(n.issues||[]).join('；'))).join('；'):code==='CONTENT_REVIEW_INVALID'?'学科复核回复未符合契约。'+String(error.detail||error.cause?.message||'').slice(0,240):serviceFailures[code]||'学科复核连接未完成。';
  await store.create(key+'/result.json',{status:'failed',error:code,notes:error.notes||[],failureDetail:detail.slice(0,1600)+'原始题文保留；继续时只重试复核，不重新出题。',finishedAt:now()});
 }
 await snapshot(store,parent,{now,dispatch});
 if(manifest.job.group)await require('./exercise-groups.cjs').advance(store,parentKey(parent,manifest.job.group.parentId),{now,dispatch});
 return {ok:true};
}
module.exports={begin,snapshot,resume,runStep};
