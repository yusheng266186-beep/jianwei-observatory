'use strict';
const {createProgressWriter}=require('./progress.cjs');
const {validationSummary}=require('./validation-summary.cjs');
const {recordCheck}=require('./model-control.cjs');
const delivery=require('./result-delivery.cjs');
const {COSStore}=require('./store.cjs'),{generate,generationProfile}=require('./generator.cjs'),{generateIllustration}=require('./illustration.cjs');
const parentOf=(key,id)=>key.slice(0,key.lastIndexOf('/')+1)+id;
// A delivery candidate may be committed without another model call. Advance the
// owning figure/group/repair aggregate explicitly instead of re-entering this
// worker for the same key.
async function advanceRecovered(store,key,job,restored,{now,dispatch}){
 const groups=require('./exercise-groups.cjs');
 if(job.type==='content-review'&&job.review?.parentId){
  const parent=parentOf(key,job.review.parentId),state=await require('./content-review.cjs').snapshot(store,parent,{now,dispatch}),manifest=(await store.get(parent+'/content-review-manifest.json'))?.value;
  if(manifest?.job.group)await groups.advance(store,parentOf(parent,manifest.job.group.parentId),{now,dispatch});
  return state||restored;
 }
 if(restored?.contentReviewPipeline){
  const state=await require('./content-review.cjs').snapshot(store,key,{now,dispatch})||await require('./figure-pipeline.cjs').snapshot(store,key,{now,dispatch});
  if(job.group?.parentId)await groups.advance(store,parentOf(key,job.group.parentId),{now,dispatch});
  return state||restored;
 }
 if(job.type==='format-repair'&&job.repair?.parentId){
  const parent=parentOf(key,job.repair.parentId),state=await require('./format-repair.cjs').snapshot(store,parent,{now,dispatch}),manifest=(await store.get(parent+'/format-repair.json'))?.value;
  if(manifest?.group)await groups.advance(store,parentOf(parent,manifest.group.parentId),{now,dispatch});
  return state||restored;
 }
 if(job.type==='figure-step'&&job.figure?.parentId){
  const parent=parentOf(key,job.figure.parentId),state=await require('./figure-pipeline.cjs').snapshot(store,parent,{now,dispatch}),manifest=(await store.get(parent+'/figure-manifest.json'))?.value;
  if(manifest?.group)await groups.advance(store,parentOf(parent,manifest.group.parentId),{now,dispatch});
  return state||restored;
 }
 if(restored?.figurePipeline){
  const state=await require('./figure-pipeline.cjs').snapshot(store,key,{now,dispatch});
  if(job.group?.parentId)await groups.advance(store,parentOf(key,job.group.parentId),{now,dispatch});
  return state||restored;
 }
 if(job.group?.parentId&&restored?.status==='ready')await groups.advance(store,parentOf(key,job.group.parentId),{now,dispatch});
 return restored;
}
async function run(event,{store=new COSStore(),generator=generate,illustrator=generateIllustration,prober=require('./model-completion.cjs').probeModel,repairer=generate,contentReviewer,now=Date.now,modelStore,dispatch}={}){
 if(!event||!/^jobs\/[a-f0-9]{32}\/[a-f0-9-]{36}$/.test(event.key||''))throw new Error('INVALID_JOB_EVENT');
 const found=await store.get(event.key+'/meta.json'),job=found?.value;if(!job||await store.get(event.key+'/removed.json'))return {skipped:true};
 const restored=await delivery.recover(store,event.key,job,{now,dispatch});if(restored){const advanced=await advanceRecovered(store,event.key,job,restored,{now,dispatch});return {recovered:true,pending:advanced?.status!=='ready'};}
 if(job.deadline<now())return {skipped:true};
 if(job.type==='content-review')return require('./content-review.cjs').runStep(store,event.key,job,{now,dispatch,...(contentReviewer?{reviewer:contentReviewer}:{})});
 if(job.type==='format-repair')return require('./format-repair.cjs').runStep(store,event.key,job,{now,dispatch,generator:repairer});
 const figures=require('./figure-pipeline.cjs');if(job.type==='figure-step')return figures.runStep(store,event.key,job,{now,dispatch});
 const groups=require('./exercise-groups.cjs');if(job.type==='exercise'&&groups.grouped(job.input))return groups.begin(store,event.key,job,{now,dispatch});if(job.type==='exercise-part'){const parent=event.key.slice(0,event.key.lastIndexOf('/')+1)+job.group.parentId;if(await store.get(parent+'/removed.json'))return {cancelled:true};store=groups.childStore(store,event.key,job,{now,dispatch});}
 const profile=job.generation?.protocol?job.generation:generationProfile(job.generation?.provider||'gemini'),startedAt=now();
 if(!await store.create(event.key+'/run.json',{startedAt,deadlineAt:startedAt+(job.type==='model-probe'?60000:job.type==='illustration'?885000:Math.min(profile.timeoutMs,885000))}))return {skipped:true};
 const controller=new AbortController(),progress=job.type!=='model-probe'?createProgressWriter({store,key:event.key,total:job.input?.count||0,now,controller}):null;await progress?.flush().catch(()=>{});
 const check=async result=>{if(job.type==='model-probe'){try{const controls=modelStore||(process.env.TRAINING_BUCKET?new COSStore({prefix:'training-control-v1/'}):null);if(controls)await recordCheck(controls,profile,result,now());}catch{}}};
 try{let result;if(job.type==='model-probe'){result=await prober(profile);}else if(job.type==='illustration'){const parent=event.key.slice(0,event.key.lastIndexOf('/'))+'/'+job.input.sourceId,source=await store.get(parent+'/recovered.json')||await store.get(parent+'/result.json'),diagram=source?.value.sheet?.questions.find(q=>q.id===job.input.questionId)?.diagram;if(diagram?.kind!=='illustration')throw new Error('IMAGE_SOURCE_INVALID');result={image:await illustrator(diagram,{generation:job.imageGeneration,store,jobKey:parent,request:{questionId:job.input.questionId,...(job.input.redraw?{redrawId:job.id}:{})},signal:controller.signal,isRemoved:()=>delivery.active(store,event.key,job).then(()=>false).catch(e=>{if(e.message==='JOB_CANCELLED')return true;throw e;})}),provider:job.imageGeneration?.provider||'bytecat-image',sourceId:job.input.sourceId,questionId:job.input.questionId,model:job.imageGeneration?.model||'gpt-image-2'};}else if(job.type==='figure-refresh'){const source=await store.get(event.key.slice(0,event.key.lastIndexOf('/')+1)+job.input.sourceId+'/recovered.json')||await store.get(event.key.slice(0,event.key.lastIndexOf('/')+1)+job.input.sourceId+'/result.json');if(source?.value.status!=='ready')throw new Error('IMAGE_SOURCE_INVALID');const text=structuredClone(source.value);if(job.input.question)text.sheet.questions[text.sheet.questions.findIndex(q=>q.id===job.input.questionId)]=job.input.question;const q=text.sheet.questions.find(q=>q.id===job.input.questionId);if(!q)throw new Error('IMAGE_SOURCE_INVALID');if(!q.figureRequest){const first=q.stem.split('\n\n')[0].split('\n')[0];q.figureRequest={caption:q.diagram?.caption||'题目图示',requirements:q.diagram?.description||'依据题干中的已知条件绘制必需图示，不标出所求答案。',knownData:'以题干的完整已知条件为准；原图说明：'+(q.diagram?.description||'无原图'),labels:[],precision:['数学','物理','化学'].includes(job.sourceRequest.subject)?'exact':'illustrative',placement:q.figureLayout||{after:first.slice(-600),width:'wide',aspect:'wide'}};}await progress.update({phase:'saving'});await progress.flush();await delivery.save(store,event.key,job,text,{stage:'figures',now,dispatch});await progress.close('figure-planning');return {figures:true};}else result=await generator(job.input,{provider:profile.provider,onProgress:progress?.update,signal:controller.signal,separateFigures:job.pipeline===2,...(profile.protocol?{generation:profile}:{}),...(job.groupContext?{groupScope:job.groupContext}:{})});if(controller.signal.aborted||await store.get(event.key+'/removed.json'))throw new Error('JOB_CANCELLED');if(job.contentReview&&result?.sheet){await progress.update({phase:'saving'});await progress.flush();await delivery.save(store,event.key,job,result,{stage:'content',now,dispatch});await progress.close('content-reviewing');return {contentReview:true};}if(job.pipeline===2&&result?.sheet?.questions?.some(q=>q.figureRequest)){await progress.update({phase:'saving'});await progress.flush();await delivery.save(store,event.key,job,result,{stage:'figures',now,dispatch});await progress.close('figure-planning');return {figures:true};}if(controller.signal.aborted||await store.get(event.key+'/removed.json'))throw new Error('JOB_CANCELLED');await progress?.update({phase:'saving'});await progress?.flush();if(controller.signal.aborted||await store.get(event.key+'/removed.json'))throw new Error('JOB_CANCELLED');await delivery.save(store,event.key,job,{...result,status:'ready',finishedAt:now()},{now,dispatch});await progress?.close('ready');await check({...result,status:'ready'});if(job.group)await groups.advance(store.source,store.parent,{now,dispatch});return {ok:true};}
 catch(error){let pendingSave=error.message==='RESULT_SAVE_PENDING';if(!pendingSave)try{pendingSave=!!await store.get(event.key+'/delivery-candidate.json')}catch{pendingSave=delivery.storageFailure(error);}if(pendingSave){if(error.message==='JOB_CANCELLED'){await progress?.close('removed');return {cancelled:true};}await progress?.close('saving');throw error;}if(require('./format-repair.cjs').eligible(error)){await progress?.close('format-repairing');await store.create(event.key+'/diagnostic.json',{at:now(),category:error.message,validation:error.cause?.message,raw:error.output,truncated:false,upstream:error.diagnostic});if(await require('./format-repair.cjs').begin(store.source||store,event.key,job,error,{now,dispatch})){if(job.group)await groups.advance(store.source,store.parent,{now,dispatch});return {repair:true};}}await progress?.close(error.message==='JOB_CANCELLED'?'removed':'failed');if(error.message==='JOB_CANCELLED')return {cancelled:true};{try{await store.create(event.key+'/diagnostic.json',{at:now(),category:/^[A-Z][A-Z0-9_]{2,80}$/.test(error.message||'')?error.message:'UNCLASSIFIED_ERROR',runtimeCode:/^[A-Z][A-Z0-9_]{2,80}$/.test(error.code||'')?error.code:undefined,validation:error.cause?.message,...(error.output?{raw:String(error.output).slice(0,256000),truncated:String(error.output).length>256000}:{}),...(error.diagnostic?{upstream:error.diagnostic}:{})});}catch{}}const normalized=error.message==='OPENAI_AUTH_TEMPORARY'?'MODEL_REQUEST_FAILED':['ECONNRESET','EPIPE','ETIMEDOUT','NETWORK_INTERRUPTED'].includes(error.code||error.message)?'MODEL_CONNECTION_LOST':['RESPONSE_LIMIT','MODEL_OUTPUT_LIMIT'].includes(error.message)?'MODEL_OUTPUT_LIMIT':['MODEL_BAD_RESPONSE'].includes(error.message)?'MODEL_BAD_RESPONSE':error.message;const code=['MODEL_UPSTREAM_TIMEOUT','MODEL_CONNECTION_LOST','MODEL_OUTPUT_LIMIT','MODEL_BAD_RESPONSE','MODEL_BALANCE_REQUIRED','MODEL_SUBSCRIPTION_EXPIRED','MODEL_AUTH_FAILED','MODEL_RATE_LIMIT','MODEL_INCOMPLETE','MODEL_CONTENT_INVALID','MODEL_REQUEST_FAILED','NETWORK_TIMEOUT','IMAGE_NOT_CONFIGURED','IMAGE_AUTH_FAILED','IMAGE_RATE_LIMIT','IMAGE_REQUEST_FAILED','IMAGE_RESPONSE_INVALID','IMAGE_SOURCE_INVALID','IMAGE_UNAVAILABLE','IMAGE_URL_REJECTED','IMAGE_CANDIDATE_EXPIRED','IMAGE_CANDIDATE_MISSING','IMAGE_CANDIDATE_STORE_FAILED','IMAGE_CANDIDATE_BINDING_MISMATCH','IMAGE_CANDIDATE_INVALID','IMAGE_CANDIDATE_LIMIT'].includes(normalized)?normalized:'GENERATION_FAILED';await store.create(event.key+'/result.json',{status:'failed',error:code,...(require('./upstream-event.cjs').userFailureDetail(error)?{failureDetail:require('./upstream-event.cjs').userFailureDetail(error)}:code==='MODEL_OUTPUT_LIMIT'&&error.diagnostic?.kind==='completion'?{failureDetail:'上游模型在思考与正文的输出额度上限处结束，整份练习尚未完整返回，生成记录已保留。'}:code==='MODEL_INCOMPLETE'&&error.diagnostic?.kind==='completion'?{failureDetail:'上游模型未返回完整成稿或正常结束标记，生成记录已保留。'}:code==='MODEL_UPSTREAM_TIMEOUT'?{failureDetail:error.diagnostic?.status===524?'中转服务等待模型响应超时（HTTP 524），未收到完整试题。已生成的题目保留，可继续当前题组。':'上游模型服务等待响应超时，已生成的题目保留，可继续当前题组。'}:code==='MODEL_CONTENT_INVALID'?{failureDetail:validationSummary(error.cause?.message)}:code==='NETWORK_TIMEOUT'&&job.type==='exercise'?{failureDetail:'本次模型调用已等待14分钟，达到当前云端单次调用时限，生成记录已保留。可调整后重新生成。'}:{}),finishedAt:now()});await check({status:'failed',error:code});if(job.group)await groups.advance(store.source,store.parent,{now,dispatch});return {ok:false};}
}
function recordKey(record){
 const bucket=record?.cos?.cosBucket,expected=process.env.TRAINING_BUCKET;
 if(expected&&bucket?.name+'-'+bucket?.appid!==expected)return null;
 let name;try{name=decodeURIComponent(record?.cos?.cosObject?.key||'');}catch{return null;}
 const match=name.match(/(?:^|\/)training-v1\/(jobs\/[a-f0-9]{32}\/[a-f0-9-]{36})\/meta\.json$/);
 return match&&record.event?.eventSource==='qcs::cos'&&String(record.event.eventName||'').startsWith('cos:ObjectCreated:')?match[1]:null;
}
async function handle(event,options={}){
 if(!Array.isArray(event?.Records))return run(event,options);
 const keys=[...new Set(event.Records.map(recordKey).filter(Boolean))],limit=Math.max(1,Math.min(8,Number.isSafeInteger(options.concurrency)?options.concurrency:Number(process.env.TRAINING_WORKER_CONCURRENCY||2)||2));
 let next=0,failed=0;
 const worker=async()=>{while(true){const index=next++;if(index>=keys.length)return;try{await run({key:keys[index]},options);}catch{failed++;}}};
 await Promise.all(Array.from({length:Math.min(limit,keys.length)},worker));
 if(failed)throw Object.assign(new Error('WORKER_RECORD_FAILED'),{handled:keys.length,failed});
 return {handled:keys.length};
}
exports.main_handler=event=>handle(event);exports.run=run;exports.handle=handle;
