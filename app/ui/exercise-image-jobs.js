// Asynchronous figure/illustration jobs belong to the exact question source
// that was submitted. A late result must never be written onto an edited question.
const stableValue=value=>{
 if(value===undefined)return 'undefined';
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(stableValue).join(',')+']';
 return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stableValue(value[key])).join(',')+'}';
};
const imageFields=['type','stem','choices','answer','analysis','points','figureRequest','diagram'];
const figureFields=[...imageFields,'figureLayout'];
const pick=(source,fields)=>Object.fromEntries(fields.filter(field=>Object.hasOwn(source,field)).map(field=>[field,source[field]]));
export function imageSourceQuestion(question){
 const copy=structuredClone(question&&typeof question==='object'?question:{});
 if(copy.figureLayout&&typeof copy.figureLayout==='object')delete copy.figureLayout.widthPercent;
 if(copy.diagram&&typeof copy.diagram==='object')delete copy.diagram.image;
 return copy;
}
export function figureSourceHash(question){
 return stableValue(pick(imageSourceQuestion(question),figureFields));
}
export function illustrationSourceHash(question){
 // Illustration placement is independent of the generated bitmap; a width
 // change while the image is in flight is not a source change.
 return stableValue(pick(imageSourceQuestion(question),imageFields));
}
// The old studio hashed only these five fields. Keep it for jobs persisted by
// that version so a valid legacy result is not discarded on upgrade.
export function legacyFigureSourceHash(question){
 return JSON.stringify([question?.stem,question?.choices,question?.answer,question?.analysis,question?.points]);
}
export function createImageJob(record,{questionId,type='illustration',question,id=crypto.randomUUID(),now=Date.now()}={}){
 const kind=type==='figure'?'figure':'illustration',source=imageSourceQuestion(question),sourceId=record?.localCopyOf||record?.id;
 const submission=kind==='figure'?{sourceId,questionId,redraw:true,question:source}:{sourceId,questionId,redraw:false};
 return {id,type:kind,questionId,status:'submitting',createdAt:now,sourceHashVersion:2,sourceHash:kind==='figure'?figureSourceHash(source):illustrationSourceHash(source),submission};
}
export function imageJobBusy(record,questionId){
 const job=record?.imageJobs?.[questionId];
 return !!job&&['submitting','unconfirmed','queued','running'].includes(job.status);
}
export function imageReplayBody(job,record){
 if(job?.submission&&typeof job.submission==='object')return job.submission;
 return {sourceId:record?.localCopyOf||record?.id,questionId:job?.questionId};
}
export function imageJobSourceCheck(job,question){
 if(job?.submission?.question&&typeof job.submission.question==='object'){
  const submitted=job.submission.question,hashFor=job.type==='figure'?figureSourceHash:illustrationSourceHash;
  return {verified:true,basis:'submission',match:hashFor(submitted)===hashFor(question)};
 }
 if(job?.sourceHashVersion===2&&typeof job.sourceHash==='string'){
  const hashFor=(job.type==='figure'?figureSourceHash:illustrationSourceHash)(question);
  return {verified:true,basis:'hash-v2',match:hashFor===job.sourceHash};
 }
 if(job?.type==='figure'&&typeof job.sourceHash==='string'){
  return {verified:true,basis:'legacy-hash',match:job.sourceHash===legacyFigureSourceHash(question)};
 }
 return {verified:false,basis:'missing',match:false};
}
const staleMessage=(verified,reason)=>{
 if(reason==='kind')return '插图对应的题目内容已变化，未写入当前题目。请按当前题目重新生成。';
 if(reason==='missing')return '当前题目已变化，图示结果未写入。请重新绘图。';
 if(!verified)return '这张图示来自旧版本任务，无法确认对应的题干版本，未写入当前题目。请按当前题干重新绘图。';
 return '题干已在绘图期间修改，这张图示未写入当前题目。请按当前题干重新绘图。';
};
// Apply a polled/stored payload only when it still belongs to this question's
// submitted source. A stale payload leaves the teacher's edited question intact.
export function applyImagePayload(record,job,data){
 if(!data?.diagram&&!data?.image)return {changed:false,stale:false,reason:'pending'};
 const questionId=Number(data?.questionId??job?.questionId);
 if(!Number.isInteger(questionId)||Number(job?.questionId)!==questionId){
  job.status='failed';job.failure=staleMessage(false,'missing');job.stale=true;delete job.syncIssue;
  return {changed:true,stale:true,reason:'question'};
 }
 const question=record?.sheet?.questions?.find(item=>item.id===questionId);
 if(!question){
  job.status='failed';job.failure=staleMessage(false,'missing');job.stale=true;delete job.syncIssue;
  return {changed:true,stale:true,reason:'missing'};
 }
 const check=imageJobSourceCheck(job,question);
 if(!check.match){
  job.status='failed';job.failure=staleMessage(check.verified,'changed');job.stale=true;delete job.syncIssue;
  return {changed:true,stale:true,reason:check.verified?'source':'unverified'};
 }
 let changed=false;
 if(data.diagram){
  question.diagram=data.diagram;
  record.figureReviewNotes=[...(record.figureReviewNotes||[]).filter(note=>note.questionId!==question.id),...(Array.isArray(data.figureReviewNotes)?data.figureReviewNotes:[])];
  if(!question.figureLayout&&data.figureLayout)question.figureLayout=data.figureLayout;
  record.reviewedAt=null;changed=true;
 }
 if(data.image){
  if(question.diagram?.kind!=='illustration'){
   job.status='failed';job.failure=staleMessage(true,'kind');job.stale=true;delete job.syncIssue;
   return {changed:true,stale:true,reason:'kind'};
  }
  question.diagram.image=data.image;record.reviewedAt=null;changed=true;
 }
 if(changed){
  job.status='ready';delete job.failure;delete job.stale;delete job.syncIssue;
 }
 return {changed,stale:false,reason:changed?'applied':'empty'};
}
