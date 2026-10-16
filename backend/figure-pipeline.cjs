'use strict';
const crypto=require('node:crypto');
const {createProgressWriter}=require('./progress.cjs');
const {planFigure,reviewFigure}=require('./figure-generation.cjs');
const {generateIllustration}=require('./illustration.cjs');
const uuid=text=>{const h=crypto.createHash('sha256').update(text).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);};
const jobKey=(parent,id)=>parent.slice(0,parent.lastIndexOf('/')+1)+id;
const attemptKey=(parent,q,n)=>parent+'/figure-attempts/'+q+'/'+String(n).padStart(6,'0')+'.json';
async function removed(store,key,manifest){return !!(await store.get(key+'/removed.json')||manifest.group&&await store.get(jobKey(key,manifest.group.parentId)+'/removed.json')||manifest.sourceId&&await store.get(jobKey(key,manifest.sourceId)+'/removed.json'));}
async function latestAttempt(store,key,q){let n=0,current=await store.get(attemptKey(key,q,0));if(!current)return {attempt:0,feedback:[]};let high=1;while(await store.get(attemptKey(key,q,high)))high*=2;let low=0;while(high-low>1){const mid=Math.floor((low+high)/2);if(await store.get(attemptKey(key,q,mid)))low=mid;else high=mid;}n=low;return {attempt:n,...(await store.get(attemptKey(key,q,n))).value};}
async function ensureStep(store,key,manifest,q,attempt,stage,{now=Date.now,dispatch=async()=>{}}={}){
 const id=uuid(key+'|figure|'+q+'|'+attempt.attempt+'|'+stage),child=jobKey(key,id),saved=await store.get(child+'/meta.json');
 if(!saved&&!await removed(store,key,manifest)){const createdAt=now();if(await store.create(child+'/meta.json',{id,type:'figure-step',input:{},figure:{parentId:key.split('/').at(-1),questionId:q,attempt:attempt.attempt,stage,feedback:attempt.feedback||[]},generation:stage==='plan'?manifest.figureGeneration:manifest.generation,status:'queued',createdAt,deadline:createdAt+600000}))await dispatch(child);}
 return child;
}
async function stepState(store,key,manifest,q,attempt,stage,options){
 const child=await ensureStep(store,key,manifest,q,attempt,stage,options),[result,run,progress,meta]=await Promise.all(['result','run','progress','meta'].map(name=>store.get(child+'/'+name+'.json'))),deadline=run?.value.deadlineAt||(meta?.value.deadline||options.now())+15000;
 return {child,stage,questionId:q,attempt:attempt.attempt,result:result?.value,progress:progress?.value,status:result?.value.status||(deadline<options.now()?'failed':run?'running':'queued'),error:result?.value.error||(deadline<options.now()?'JOB_EXPIRED':undefined)};
}
async function nextAttempt(store,key,manifest,q,previous,feedback,{reusePlan=false,planResult}={},options={}){
 const next={attempt:previous.attempt+1,feedback};
 if(reusePlan)for(const stage of ['plan','render']){
  const before=jobKey(key,uuid(key+'|figure|'+q+'|'+previous.attempt+'|'+stage)),result=await store.get(before+'/result.json');
  if(result?.value.status==='ready'){const target=jobKey(key,uuid(key+'|figure|'+q+'|'+next.attempt+'|'+stage));await store.create(target+'/result.json',result.value);const progress=await store.get(before+'/progress.json');if(progress)await store.progress(target+'/progress.json',progress.value);}
 }
 if(planResult)await store.create(jobKey(key,uuid(key+'|figure|'+q+'|'+next.attempt+'|plan'))+'/result.json',planResult);
 await store.create(attemptKey(key,q,next.attempt),{feedback,createdAt:(options.now||Date.now)()});return next;
}
async function states(store,key,manifest,options){
 const out=[];let imageUsed=false;
 for(const q of manifest.questions){const attempt=await latestAttempt(store,key,q);let state=await stepState(store,key,manifest,q,attempt,'plan',options);
  const logs=[],log=s=>{if(s.progress)logs.push({questionId:q,stage:s.stage,model:s.result?.model|| (s.stage==='plan'?manifest.figureGeneration.model:manifest.generation.model),...s.progress,usage:s.result?.usage||s.progress?.usage});};log(state);
  if(state.status==='failed'&&state.error==='FIGURE_PLAN_INVALID'&&attempt.attempt===0){const feedback=state.result?.issues||['图示参数未通过校验，请按原题与Schema重新绘制。'];await store.create(attemptKey(key,q,1),{feedback,createdAt:options.now()});return states(store,key,manifest,options);}
  if(state.status!=='ready'){out.push({...state,logs});break;}
  const diagram=state.result.diagram;
  if(diagram.kind==='illustration'){
   if(imageUsed){out.push({...state,status:'failed',stage:'plan',error:'FIGURE_IMAGE_LIMIT',failureDetail:'同一份练习的复杂插图超过所选策略，请改用矢量图。'});break;}imageUsed=true;
   state=await stepState(store,key,manifest,q,attempt,'render',options);log(state);if(state.status!=='ready'){out.push({...state,logs});break;}
  }
  const rendered=state.result.diagram;state=await stepState(store,key,manifest,q,attempt,'review',options);log(state);
  if(state.status==='ready'&&!state.result.approved){state={...state,status:'failed',error:'FIGURE_REVIEW_FAILED',failureDetail:state.result.issues.join('；')};
   // A single targeted correction is automatic; subsequent retries are explicit.
   if(attempt.attempt===0){await store.create(attemptKey(key,q,1),{feedback:state.result.issues,createdAt:options.now()});return states(store,key,manifest,options);}
  }
  if(state.status==='failed'&&state.error!=='FIGURE_REVIEW_FAILED'&&attempt.attempt===0){await nextAttempt(store,key,manifest,q,attempt,['核对响应未符合JSON格式，请只输出规定的JSON对象。'],{reusePlan:true},options);return states(store,key,manifest,options);}
  out.push({...state,logs,...(state.status==='ready'?{diagram:rendered,contentIssues:state.result.contentIssues||[]}:{})});if(state.status!=='ready')break;
 }return out;
}
async function publish(store,key,manifest,list,now=Date.now){
 if(await removed(store,key,manifest))return;const old=(await store.get(key+'/progress.json'))?.value||{},text=(await store.get(key+'/text-progress.json'))?.value||{},active=list.find(s=>s.status!=='ready'),live=active?.progress||{},stage=active?.stage||'review',name={plan:'图示规划',render:'绘制配图',review:'图题核对'}[stage],notes=live.thinkingText||live.summary||'',phase=active?{plan:'figure-planning',render:'figure-rendering',review:'figure-reviewing'}[stage]:'ready';
 const revision=list.reduce((n,s)=>n+(s.attempt+1)*100+(s.stage==='review'?30:s.stage==='render'?20:10)+(s.status==='ready'?1:0),0);
 if((old.figureRevision||0)>revision)return;
 const figureLog=list.flatMap(s=>s.logs||[]).map(p=>({questionId:p.questionId,stage:p.stage,model:p.model,thinkingText:(p.thinkingText||'').slice(-20000),summary:p.summary||'',timing:p.timing,usage:p.usage,outputText:(p.outputText||'').slice(0,24000)}));
 await store.progress(key+'/progress.json',{...text,phase,sequence:(old.sequence||0)+1,figureRevision:revision,heartbeatAt:now(),receivedAt:live.receivedAt||old.receivedAt||now(),thinkingChars:(text.thinkingChars||0)+(live.thinkingChars||0),responseChars:text.responseChars||0,thinkingText:[text.thinkingText,notes?'第'+active.questionId+'题 · '+name+'\n'+notes:''].filter(Boolean).join('\n\n').slice(-160000),figureOutputText:live.outputText||'',figureLog,figureStage:active?{questionId:active.questionId,stage,label:name,status:active.status,error:active.error,attempt:active.attempt}:null,figureCompleted:list.filter(s=>s.status==='ready').length,figureTotal:manifest.questions.length});
}
async function begin(store,key,job,text,{now=Date.now,dispatch=async()=>{}}={}){
 const questions=job.type==='figure-refresh'?[job.input.questionId]:(text.sheet.questions||[]).filter(q=>q.figureRequest).map(q=>q.id);
 if(!questions.length)return false;
 await store.create(key+'/text-result.json',text);const progress=(await store.get(key+'/progress.json'))?.value||{};await store.create(key+'/text-progress.json',progress);
 await store.create(key+'/figure-manifest.json',{version:1,questions,input:job.type==='figure-refresh'?job.sourceRequest:job.input,generation:job.generation,figureGeneration:job.figureGeneration||job.generation,...(job.group?{group:job.group}:{}),...(job.type==='figure-refresh'?{refresh:true,sourceId:job.input.sourceId}:{}),createdAt:now()});
 for(const q of questions)await store.create(attemptKey(key,q,0),{feedback:[],createdAt:now()});
 await snapshot(store,key,{now,dispatch});if(job.group)await require('./exercise-groups.cjs').advance(store,jobKey(key,job.group.parentId),{now,dispatch});return true;
}
async function snapshot(store,key,{now=Date.now,dispatch=async()=>{}}={}){
 const manifest=(await store.get(key+'/figure-manifest.json'))?.value;if(!manifest||await removed(store,key,manifest))return null;
 const existing=await store.get(key+'/result.json');if(existing?.value.status==='ready')return existing.value;
 const list=await states(store,key,manifest,{now,dispatch}),active=list.find(s=>s.status!=='ready');await publish(store,key,manifest,list,now);
 if(active)return {status:active.status==='failed'?'failed':'running',figurePipeline:true,figureStage:active.stage,figureQuestion:active.questionId,completedQuestions:manifest.refresh?1:manifest.input.count,figureCompleted:list.filter(s=>s.status==='ready').length,figureTotal:manifest.questions.length,deadlineAt:now()+930000,...(active.status==='failed'?{error:active.stage==='review'?'FIGURE_REVIEW_FAILED':active.stage==='render'?'FIGURE_IMAGE_FAILED':'FIGURE_PLAN_FAILED',resumeAvailable:true,failureDetail:'第'+active.questionId+'题'+{plan:'图示规划',render:'配图绘制',review:'图题核对'}[active.stage]+'未完成，题目内容已保留。'+(active.failureDetail||'可以单独重试图示，无需重新出题。')}:{})};
 const text=(await store.get(key+'/text-result.json')).value,sheet=structuredClone(text.sheet);for(const item of list){const q=sheet.questions.find(q=>q.id===item.questionId);q.diagram=item.diagram;}
 const figureReviewNotes=list.filter(item=>item.contentIssues?.length).map(item=>({questionId:item.questionId,issues:item.contentIssues}));
 let result;if(manifest.refresh)result={diagram:sheet.questions.find(q=>q.id===manifest.questions[0]).diagram,sourceId:manifest.sourceId,questionId:manifest.questions[0],figureLayout:sheet.questions.find(q=>q.id===manifest.questions[0]).figureLayout||sheet.questions.find(q=>q.id===manifest.questions[0]).figureRequest?.placement};else{const {validateExerciseResult,validateGeneratedExerciseFigures}=await import('./exercise-contract.mjs');validateExerciseResult(sheet,manifest.input);validateGeneratedExerciseFigures(sheet,manifest.input);result={...text,sheet,figureModels:{exercise:manifest.generation.model,diagram:manifest.figureGeneration.model},figurePipeline:true};}
 result={...result,figureReviewNotes,status:'ready',finishedAt:now()};await store.create(key+'/result.json',result);return (await store.get(key+'/result.json')).value;
}
async function resume(store,key,{now=Date.now,dispatch=async()=>{}}={}){
 const manifest=(await store.get(key+'/figure-manifest.json'))?.value;if(!manifest)return null;
 if(await removed(store,key,manifest))throw Object.assign(new Error('JOB_REMOVED'),{status:410});
 const list=await states(store,key,manifest,{now,dispatch}),active=list.find(s=>s.status!=='ready');
 if(active?.status==='failed'){const previous=await latestAttempt(store,key,active.questionId);let planResult;
  if(active.error==='FIGURE_PLAN_INVALID'){const diagnostic=await store.get(active.child+'/diagnostic.json'),text=await store.get(key+'/text-result.json'),q=text?.value.sheet.questions.find(q=>q.id===active.questionId);if(diagnostic?.value.raw&&q)try{const diagram=await require('./figure-generation.cjs').parseFigurePlan(diagnostic.value.raw,q,manifest.input);planResult={status:'ready',diagram,model:manifest.figureGeneration.model,recoveredOriginal:true,finishedAt:now()};}catch{}}
  await nextAttempt(store,key,manifest,active.questionId,previous,active.result?.issues||[active.failureDetail||'前次图示未完成，请按原题重新检查结构与数据。'],{planResult,reusePlan:active.stage==='review'&&active.error!=='FIGURE_REVIEW_FAILED'},{now,dispatch});}

 return snapshot(store,key,{now,dispatch});
}
async function runStep(store,key,job,{now=Date.now,dispatch=async()=>{},planner=planFigure,reviewer=reviewFigure,illustrator=generateIllustration}={}){
 const parent=jobKey(key,job.figure.parentId),manifest=(await store.get(parent+'/figure-manifest.json'))?.value;
 if(!manifest||await removed(store,parent,manifest)||await store.get(key+'/removed.json'))return {cancelled:true};
 if(await store.get(key+'/result.json'))return {skipped:true};
 if(!await store.create(key+'/run.json',{startedAt:now(),deadlineAt:now()+885000}))return {skipped:true};
 const controller=new AbortController(),proxy={get:name=>name===key+'/removed.json'?removed(store,parent,manifest).then(r=>r?{value:{}}:store.get(name)):store.get(name),async progress(name,value){await store.progress(name,value);const list=await states(store,parent,manifest,{now,dispatch:async()=>{}});await publish(store,parent,manifest,list,now);}},progress=createProgressWriter({store:proxy,key,total:1,now,controller});await progress.flush();
 try{const text=(await store.get(parent+'/text-result.json')).value,q=text.sheet.questions.find(q=>q.id===job.figure.questionId),options={generation:job.generation,onProgress:progress.update,signal:controller.signal,feedback:job.figure.feedback};let result;
  if(job.figure.stage==='plan'){let request=manifest.input;for(const id of manifest.questions.filter(id=>id<q.id)){const a=await latestAttempt(store,parent,id),plan=await stepState(store,parent,manifest,id,a,'plan',{now,dispatch});if(plan.result?.diagram?.kind==='illustration')request={...request,visuals:'vector'};}result=await planner(q,request,options);}
  else{const attempt={attempt:job.figure.attempt},plan=await stepState(store,parent,manifest,q.id,attempt,'plan',{now,dispatch}),diagram=plan.result.diagram;
   if(job.figure.stage==='render')result={diagram:{...diagram,image:await illustrator(diagram,{layout:q.figureLayout||q.figureRequest?.placement})}};
   else{const rendered=diagram.kind==='illustration'?(await stepState(store,parent,manifest,q.id,attempt,'render',{now,dispatch})).result.diagram:diagram;result=await reviewer(q,manifest.input,rendered,options);}
  }
  if(controller.signal.aborted||await removed(store,parent,manifest)){await progress.close('removed');return {cancelled:true};}await progress.close('ready');await store.create(key+'/result.json',{...result,status:'ready',finishedAt:now()});
 }catch(error){await progress.close('failed');await store.create(key+'/diagnostic.json',{at:now(),category:error.message,validation:error.cause?.message,...(error.output?{raw:String(error.output).slice(0,256000)}:{}),...(error.diagnostic?{upstream:error.diagnostic}:{})});await store.create(key+'/result.json',{status:'failed',error:/^[A-Z_]+$/.test(error.message)?error.message:'FIGURE_GENERATION_FAILED',...(error.cause?.message?{issues:[error.cause.message]}:{}),finishedAt:now()});}
 await snapshot(store,parent,{now,dispatch});if(manifest.group)await require('./exercise-groups.cjs').advance(store,jobKey(parent,manifest.group.parentId),{now,dispatch});return {ok:true};
}
module.exports={begin,snapshot,resume,runStep};
