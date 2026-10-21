'use strict';
const crypto=require('node:crypto');
const {createProgressWriter}=require('./progress.cjs');
const delivery=require('./result-delivery.cjs');
const {validationSummary}=require('./validation-summary.cjs');
const parentKey=(key,id)=>key.slice(0,key.lastIndexOf('/')+1)+id;
const attemptPath=(key,n)=>key+'/format-repair-attempts/'+String(n).padStart(5,'0')+'.json';
const candidatePath=(key,n)=>key+'/format-repair-candidates/'+String(n).padStart(5,'0')+'.json';
const uuid=text=>{const h=crypto.createHash('sha256').update(text).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);};
const repairReason=manifest=>validationSummary(manifest.originalValidation).replace(/。?请重新生成(?:本组)?。?$/,'。');
function repairFailure(error){
 const raw=error.code||error.message;
 if(['ECONNRESET','EPIPE','ETIMEDOUT','NETWORK_INTERRUPTED','MODEL_CONNECTION_LOST'].includes(raw))return {error:'MODEL_CONNECTION_LOST',failureDetail:'校检服务连接中断，未收到完整修正稿。原稿保留，可继续本次修复。'};
 if(['NETWORK_TIMEOUT','MODEL_UPSTREAM_TIMEOUT'].includes(raw))return {error:raw,failureDetail:'校检服务等待模型响应超时。原稿保留，可稍后继续本次修复。'};
 return {error:/^[A-Z_]+$/.test(raw)?raw:'GENERATION_FAILED',failureDetail:error.cause?validationSummary(error.cause.message):'校检模型未能返回通过校验的成稿，请稍后继续修复。'};
}
function eligible(error){
 return error?.message==='MODEL_CONTENT_INVALID'&&error.diagnostic?.completeSignal===true&&typeof error.output==='string'&&error.output.trim().length>0&&error.output.length<=256000&&
  // All complete document validation failures reach the repair model. A list
  // of familiar messages used to leave other recoverable formats at a dead end.
  !/非教学内容|文档处理容量|插图总量/.test(error.cause?.message||'');
}
async function removed(store,key,manifest){return !!(await store.get(key+'/removed.json')||manifest.group&&await store.get(parentKey(key,manifest.group.parentId)+'/removed.json'));}
async function latest(store,key){let low=0,high=1;const first=await store.get(attemptPath(key,0));if(!first)return null;while(await store.get(attemptPath(key,high))){low=high;high=high*2+1;}while(high-low>1){const n=Math.floor((low+high)/2);if(await store.get(attemptPath(key,n)))low=n;else high=n;}return {attempt:low,...(low?(await store.get(attemptPath(key,low))).value:first.value)};}
// The first immutable source is the only fidelity baseline. A failed candidate
// is stored per attempt and may be shown to the repair model as diagnostic
// context, but it is never promoted to the next round's source.
async function initialSource(store,key){
 const saved=await store.get(key+'/format-repair-source.json');
 if(saved?.value&&typeof saved.value.output==='string'&&saved.value.output.trim())return {output:saved.value.output,validation:saved.value.validation||''};
 const first=await store.get(attemptPath(key,0));
 if(first?.value?.id){
  const meta=(await store.get(parentKey(key,first.value.id)+'/meta.json'))?.value;
  if(meta?.repair&&typeof meta.repair.output==='string'&&meta.repair.output.trim())return {output:meta.repair.output,validation:meta.repair.validation||meta.repair.originalValidation||''};
 }
 return null;
}
async function recordCandidate(store,key,n,{output,validation,at}){
 if(typeof output!=='string'||!output.trim())return null;
 const path=candidatePath(key,n),value={attempt:n+1,output,validation:validation||'',at};
 await store.create(path,value);return path;
}
async function ensure(store,key,manifest,n,round,{now=Date.now,dispatch=async()=>{}}={}){
 if(await removed(store,key,manifest))return null;
 const id=uuid(key+'|format-repair|'+n),child=parentKey(key,id),createdAt=now(),source=round.baseline||{output:round.output,validation:round.validation},groupContext=manifest.groupContext||manifest.job?.groupContext;
 await store.create(attemptPath(key,n),{id,createdAt});const entry=(await store.get(attemptPath(key,n))).value;
 const repair={parentId:key.split('/').at(-1),attempt:n,output:source.output,validation:round.validation||source.validation,originalValidation:source.validation,...(round.candidateKey?{candidateKey:round.candidateKey}:{})};
 if(await store.create(child+'/meta.json',{id,type:'format-repair',input:manifest.input,generation:manifest.repairGeneration,repair,...(groupContext?{groupContext}:{}),status:'queued',createdAt:entry.createdAt,deadline:entry.createdAt+600000}))await dispatch(child);
 return child;
}
async function begin(store,key,job,error,{now=Date.now,dispatch}={}){
 const limit=Number.isInteger(job.repairAttempts)?job.repairAttempts:1;
 const existing=(await store.get(key+'/result.json'))?.value;
 if(!['exercise','exercise-part'].includes(job.type)||!eligible(error)||limit<1||existing&&existing.error!=='MODEL_CONTENT_INVALID')return false;
 const generation=job.generation||require('./generator.cjs').generationProfile();
 const originalValidation=!/^\s*\{/.test(error.output)&&error.output.includes('{')?'模型在JSON正文前夹带说明文字。':String(error.cause.message).slice(0,1200);
 const manifest={version:1,input:job.input,generation,imageGeneration:job.imageGeneration,repairGeneration:job.repairGeneration||generation,limit:Math.min(limit,5),pipeline:job.pipeline,contentReview:job.contentReview,figureGeneration:job.figureGeneration||generation,...(job.group?{group:job.group}:{}),...(job.groupContext?{groupContext:job.groupContext}:{}),createdAt:now(),originalUsage:error.diagnostic?.usage||{},originalValidation};
 if(await removed(store,key,manifest))return false;
 await store.create(key+'/format-repair-source.json',{output:error.output,validation:manifest.originalValidation,createdAt:now()});
 await store.create(key+'/format-repair-progress.json',(await store.get(key+'/progress.json'))?.value||{});
 await store.create(key+'/format-repair.json',manifest);
 const saved=(await store.get(key+'/format-repair.json')).value;
 await ensure(store,key,saved,0,{output:error.output,validation:manifest.originalValidation},{now,dispatch});
 await snapshot(store,key,{now,dispatch});return true;
}
async function states(store,key,manifest,now){const entry=await latest(store,key);if(!entry)return [];const rows=[];for(let n=0;n<=entry.attempt;n++){const e=(await store.get(attemptPath(key,n))).value,child=parentKey(key,e.id),[result,run,progress,meta]=await Promise.all(['result','run','progress','meta'].map(name=>store.get(child+'/'+name+'.json'))),deadline=run?.value.deadlineAt||(meta?.value.deadline||e.createdAt+600000)+15000;rows.push({attempt:n,child,validation:meta?.value.repair?.validation,result:result?.value,progress:progress?.value||{},deadlineAt:deadline,status:result?.value.status||(deadline<now()?'failed':run?'running':'queued'),error:result?.value.error||(deadline<now()?'JOB_EXPIRED':undefined)});}return rows;}
async function publish(store,key,manifest,list,now){
 if(await removed(store,key,manifest))return;
 const source=(await store.get(key+'/format-repair-progress.json'))?.value||{},old=(await store.get(key+'/progress.json'))?.value||{},active=list.at(-1),live=active.progress,revision=(active.attempt+1)*3+(active.status==='ready'?2:active.status==='failed'?1:0);
 if((old.repairRevision||0)>revision)return;
 const phase=active.status==='failed'?'failed':active.status==='ready'?'validating':live.phase==='validating'?'format-revalidating':'format-repairing';
 const repairLog=list.map(row=>({attempt:row.attempt+1,model:manifest.repairGeneration.model,provider:manifest.repairGeneration.provider,status:row.status,reason:repairReason({...manifest,originalValidation:row.validation||manifest.originalValidation}),...(row.result?.failureDetail?{detail:row.result.failureDetail}:{}),outputText:(row.progress.outputText||'').slice(0,256000),summary:(row.progress.summary||'').slice(-4000),timing:row.progress.timing}));
 await store.progress(key+'/progress.json',{...source,phase,sequence:(old.sequence||0)+1,repairRevision:revision,repairStage:{attempt:active.attempt+1,limit:manifest.limit,model:manifest.repairGeneration.model,status:active.status,...(active.error?{error:active.error}:{}),reason:repairReason({...manifest,originalValidation:active.validation||manifest.originalValidation})},repairLog,measurements:[...require('./job-diagnostics.cjs').progressMeasurements(source,manifest.generation.model),...list.flatMap(row=>require('./job-diagnostics.cjs').progressMeasurements(row.progress,manifest.repairGeneration.model).map(p=>({...p,role:'repair'})))],thinkingChars:(source.thinkingChars||0)+list.reduce((n,row)=>n+(row.progress.thinkingChars||0),0),responseChars:(source.responseChars||0)+list.reduce((n,row)=>n+(row.progress.responseChars||0),0),...(live.outputText?{outputText:live.outputText,draft:live.draft}:{}),summary:live.summary||source.summary,heartbeatAt:now(),receivedAt:live.receivedAt||source.receivedAt});
}
async function deliver(store,key,manifest,list,{now,dispatch}){
 const active=list.at(-1),repaired=active.result;if(!repaired?.sheet||await removed(store,key,manifest))return null;
 const usage={...manifest.originalUsage};for(const field of ['input','output','thinking'])usage[field]=(usage[field]||0)+list.reduce((n,row)=>n+(row.result?.usage?.[field]||0),0);
 const result={...repaired,model:manifest.generation.model,provider:manifest.generation.provider,reasoningEffort:manifest.generation.reasoningEffort,usage,formatRepair:{attempts:active.attempt+1,model:manifest.repairGeneration.model,provider:manifest.repairGeneration.provider,reasoningEffort:manifest.repairGeneration.reasoningEffort,...(active.result?.repairFidelity?{fidelity:active.result.repairFidelity}:{})}};
 if(manifest.contentReview){await require('./content-review.cjs').begin(store,key,{...manifest,createdAt:manifest.createdAt},result,{now,dispatch});return require('./content-review.cjs').snapshot(store,key,{now,dispatch});}
 if(manifest.pipeline===2&&result.sheet.questions.some(q=>q.figureRequest)){
  const figures=require('./figure-pipeline.cjs');await figures.begin(store,key,{input:manifest.input,generation:manifest.generation,imageGeneration:manifest.imageGeneration,figureGeneration:manifest.figureGeneration,pipeline:2,group:manifest.group,...(manifest.groupContext?{groupContext:manifest.groupContext}:{})},result,{now,dispatch});return figures.snapshot(store,key,{now,dispatch});
 }
 const path=await store.get(key+'/result.json')?'/recovered.json':'/result.json';await store.create(key+path,{...result,status:'ready',finishedAt:now()});const p=(await store.get(key+'/progress.json'))?.value||{};await store.progress(key+'/progress.json',{...p,phase:'ready',heartbeatAt:now()});return (await store.get(key+path)).value;
}
async function snapshot(store,key,{now=Date.now,dispatch=async()=>{}}={}){
 const manifest=(await store.get(key+'/format-repair.json'))?.value;if(!manifest||await removed(store,key,manifest)||await store.get(key+'/figure-manifest.json')||await store.get(key+'/content-review-manifest.json'))return null;
 const existing=(await store.get(key+'/recovered.json'))?.value||(await store.get(key+'/result.json'))?.value;if(existing?.status==='ready')return existing;
 const entry=await latest(store,key);
 if(entry?.id){
  const child=parentKey(key,entry.id),meta=(await store.get(child+'/meta.json'))?.value;
  if(meta)try{await delivery.recover(store,child,meta,{now,dispatch});}catch(error){if(error.message==='JOB_CANCELLED')return null;if(error.message!=='RESULT_SAVE_PENDING'&&error.message!=='JOB_RESULT_CONFLICT')throw error;}
 }
 const list=await states(store,key,manifest,now);if(!list.length)return null;const active=list.at(-1);await publish(store,key,manifest,list,now);
 if(active.status==='ready')return await deliver(store,key,manifest,list,{now,dispatch})||{status:'failed',error:'GENERATION_FAILED',resumeAvailable:true,failureDetail:'修正稿尚未完整保存，原稿保留，可继续本次修复。'};
 return {status:active.status==='failed'?'failed':'running',formatRepair:true,repairRevision:(active.attempt+1)*3+(active.status==='failed'?1:0),deadlineAt:active.deadlineAt,...(active.status==='failed'?{error:active.error||'MODEL_CONTENT_INVALID',resumeAvailable:true,failureDetail:'第'+(active.attempt+1)+'次成稿格式修复未完成，原稿与已完成题组保留。'+(active.result?.failureDetail||'可以继续修复当前成稿。')}:{})};
}
async function runStep(store,key,job,{now=Date.now,dispatch=async()=>{},generator=require('./generator.cjs').generate}={}){
 const parent=parentKey(key,job.repair.parentId),manifest=(await store.get(parent+'/format-repair.json'))?.value;
 if(!manifest||await removed(store,parent,manifest)||await store.get(key+'/removed.json'))return {cancelled:true};
 if(!await store.create(key+'/run.json',{startedAt:now(),deadlineAt:now()+Math.min(job.generation.timeoutMs||885000,885000)}))return {skipped:true};
 const controller=new AbortController(),proxy={get:name=>name===key+'/removed.json'?removed(store,parent,manifest).then(r=>r?{value:{}}:store.get(name)):store.get(name),async progress(name,value){await store.progress(name,value);await publish(store,parent,manifest,await states(store,parent,manifest,now),now);if(manifest.group)await require('./exercise-groups.cjs').advance(store,parentKey(parent,manifest.group.parentId),{now,dispatch});}},progress=createProgressWriter({store:proxy,key,total:manifest.input.count,now,controller});await progress.flush();
 const attempt=Number.isInteger(job.repair.attempt)?job.repair.attempt:0,baseline=await initialSource(store,parent),fallback=baseline||(attempt===0?{output:job.repair.output,validation:job.repair.validation||manifest.originalValidation}:null),groupScope=job.groupContext||manifest.groupContext;
 try{
  if(!fallback)throw Object.assign(Error('MODEL_CONTENT_INVALID'),{cause:Error('缺少最初原稿保真基准，不能把后续修正稿当作原题继续修复。'),diagnostic:{kind:'document',completeSignal:true}});
  let candidate;
  if(job.repair.candidateKey){const saved=await store.get(job.repair.candidateKey);if(saved?.value&&typeof saved.value.output==='string')candidate=saved.value.output;}
  if(candidate===undefined&&typeof job.repair.candidate==='string')candidate=job.repair.candidate;
  if(candidate===undefined&&attempt>0&&job.repair.output!==fallback.output)candidate=job.repair.output;
  const validation=job.repair.validation||fallback.validation,repaired=await generator(manifest.input,{provider:job.generation.provider,generation:job.generation,repair:{output:fallback.output,validation,attempt:attempt+1,originalValidation:fallback.validation,...(candidate!==undefined?{candidate}:{})},onProgress:progress.update,signal:controller.signal,separateFigures:manifest.pipeline===2,...(groupScope?{groupScope}:{})});
  // Re-check the repair result using the exact same contract, even for injected adapters.
  const {validateOutput,validateRepairFidelity}=require('./generator.cjs'),options={separateFigures:manifest.pipeline===2,usage:repaired.usage,...(groupScope?{groupScope}:{})};await validateOutput(JSON.stringify(repaired.sheet),manifest.input,options);const fidelity=await validateRepairFidelity(fallback.output,repaired.sheet,manifest.input,options);
  if(controller.signal.aborted||await removed(store,parent,manifest))throw Error('JOB_CANCELLED');
  await progress.update({phase:'saving'});await progress.flush();
  await delivery.save(store,key,job,{...repaired,status:'ready',finishedAt:now(),repairFidelity:fidelity},{now,dispatch});await progress.close('ready');
  await snapshot(store,parent,{now,dispatch});
 }catch(error){
  if(error.message==='JOB_CANCELLED'){await progress.close('removed');return {cancelled:true};}
  let pendingSave=error.message==='RESULT_SAVE_PENDING';if(!pendingSave&&delivery.storageFailure(error))try{pendingSave=!!await store.get(key+'/delivery-candidate.json')}catch{pendingSave=true;}
  if(pendingSave){await progress.close('saving');throw error.message==='RESULT_SAVE_PENDING'?error:Object.assign(Error('RESULT_SAVE_PENDING'),{cause:error});}
  await progress.close('failed');
  const candidateKey=await recordCandidate(store,parent,attempt,{output:typeof error.output==='string'?error.output:null,validation:error.cause?.message||error.message,at:now()}).catch(()=>null);
  await store.create(key+'/diagnostic.json',{at:now(),category:error.message,validation:error.cause?.message,...(error.repairSource?{repairSource:error.repairSource}:{}),...(error.output?{raw:error.output.slice(0,256000)}:{}),...(error.diagnostic?{upstream:error.diagnostic}:{})});
  await store.create(key+'/result.json',{status:'failed',...repairFailure(error),...(error.diagnostic?.usage?{usage:error.diagnostic.usage}:{}),finishedAt:now()});
  if(eligible(error)&&attempt+1<manifest.limit&&!await removed(store,parent,manifest))await ensure(store,parent,manifest,attempt+1,{baseline:fallback||{output:job.repair.output,validation:job.repair.validation||manifest.originalValidation},validation:error.cause.message,candidateKey},{now,dispatch});
 }
 if(!await removed(store,parent,manifest)){
  await snapshot(store,parent,{now,dispatch});
  if(manifest.group)await require('./exercise-groups.cjs').advance(store,parentKey(parent,manifest.group.parentId),{now,dispatch});
 }
 return {ok:true};
}
async function resume(store,key,{now=Date.now,dispatch=async()=>{}}={}){
 let manifest=(await store.get(key+'/format-repair.json'))?.value;
 if(!manifest){
  const [meta,result,diagnostic]=await Promise.all(['meta','result','diagnostic'].map(n=>store.get(key+'/'+n+'.json'))),d=diagnostic?.value;
  if(result?.value.error!=='MODEL_CONTENT_INVALID'||!d?.raw||d.truncated)return null;
  const error=Object.assign(Error('MODEL_CONTENT_INVALID'),{cause:Error(d.validation),output:d.raw,diagnostic:{...d.upstream,completeSignal:d.upstream?.completeSignal===true}});
  // An old failed immutable result cannot be overwritten. Its repair success is
  // saved separately, preserving both the failure and the original draft.
  if(!eligible(error))return null;
  const job=meta?.value;if(!job)return null;
  // 0 disables automatic repair. An explicit continuation may still perform
  // one repair without changing this job's frozen model or global settings.
  if(!await begin(store,key,{...job,repairAttempts:Math.max(1,job.repairAttempts??1)},error,{now,dispatch}))return null;
  return snapshot(store,key,{now,dispatch});
 }
 if(await removed(store,key,manifest))throw Object.assign(Error('JOB_REMOVED'),{status:410});
 const state=await snapshot(store,key,{now,dispatch});if(!state||state.status!=='failed')return state;
 const entry=await latest(store,key);if(!entry)return state;
 const child=parentKey(key,entry.id),source=(await store.get(child+'/meta.json'))?.value?.repair||{},d=(await store.get(child+'/diagnostic.json'))?.value,baseline=await initialSource(store,key);
 if(!baseline)return {status:'failed',error:'GENERATION_FAILED',resumeAvailable:false,failureDetail:'缺少最初原稿保真基准，不能把后续修正稿当作原题继续修复。'};
 const saved=await store.get(candidatePath(key,entry.attempt));let candidate=saved?.value?.output;
 if(candidate===undefined&&typeof d?.raw==='string'&&d.raw!==baseline.output)candidate=d.raw;
 if(candidate===undefined&&entry.attempt>0&&typeof source.output==='string'&&source.output!==baseline.output)candidate=source.output;
 const validation=d?.validation||saved?.value?.validation||source.validation||baseline.validation||manifest.originalValidation;
 const candidateKey=candidate!==undefined?await recordCandidate(store,key,entry.attempt,{output:candidate,validation,at:now()}):undefined;
 await ensure(store,key,manifest,entry.attempt+1,{baseline,validation,candidateKey},{now,dispatch});return snapshot(store,key,{now,dispatch});
}
module.exports={eligible,begin,snapshot,resume,runStep};
