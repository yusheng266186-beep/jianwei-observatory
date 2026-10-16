// Three-way saves preserve changes made by other tabs. Document and approval
// are one unit: an approval must never migrate onto a different sheet.
const transient=new Set(['progress','generationLog']);
const documentFields=new Set(['sheet','request','reviewedAt','qualityReview','figureReviewNotes']);
const taskFields=new Set(['status','acceptedAt','serverCreatedAt','startedAt','finishedAt','serverTime','deadlineAt','model','provider','reasoningEffort','resumeAvailable','completedQuestions','groupIndex','groupCount','groupRevision','figurePipeline','figureStage','figureQuestion','figureCompleted','figureTotal','figureRevision','lastCheckedAt','syncIssue','failure','validationCheckedAt','usage','templateVersion','templateId','generatedAt','queueFailure']);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fields=(row,keys)=>Object.fromEntries([...keys].sort().filter(k=>Object.hasOwn(row||{},k)).map(k=>[k,row[k]]));
export const exerciseRecordSnapshot=rows=>structuredClone(rows.map(row=>Object.fromEntries(Object.entries(row).filter(([k])=>!transient.has(k)))));
export const exerciseDocumentVersion=row=>JSON.stringify(fields(row,documentFields));
function syncObject(target,source,{root=false}={}){
 for(const key of Object.keys(target))if(!(root&&transient.has(key))&&!Object.hasOwn(source,key))delete target[key];
 for(const [key,value] of Object.entries(source)){
  const previous=target[key];if(equal(previous,value))continue;
  if(previous&&value&&typeof previous==='object'&&typeof value==='object'&&!Array.isArray(previous)&&!Array.isArray(value)&&previous.id===value.id)syncObject(previous,value);
  else target[key]=structuredClone(value);
 }
}
function conflict(id,deleted=false){return Object.assign(new Error(deleted?'这份练习已在其他页面删除，当前修改仍保留，可另存为副本。':'这份练习已在其他页面修改，当前修改仍保留，请另存副本或载入已保存版本。'),{code:'EXERCISE_SAVE_CONFLICT',recordId:id});}
function newestTask(local,remote){
 for(const key of ['groupRevision','figureRevision']){const a=local[key]||0,b=remote[key]||0;if(a!==b)return a>b?local:remote;}
 const terminal=row=>['ready','failed'].includes(row.status);
 if(terminal(local)!==terminal(remote))return terminal(local)?local:remote;
 return (local.lastCheckedAt||0)>(remote.lastCheckedAt||0)?local:remote;
}
export function mergeExerciseRecords(base,local,latest,{removed=[]}={}){
 const before=new Map(base.map(r=>[r.id,r])),deleted=new Set(removed),result=new Map((latest||[]).filter(r=>!deleted.has(r.id)).map(r=>[r.id,r]));
 for(const row of local){
  const old=before.get(row.id),saved=result.get(row.id);
  if(deleted.has(row.id)){if(old&&!equal(old,row))throw conflict(row.id,true);continue;}
  if(equal(old,row))continue;
  if(!saved){if(old)throw conflict(row.id,true);result.set(row.id,row);continue;}
  if(!old){if(!equal(row,saved))throw conflict(row.id);continue;}
  const doc=exerciseDocumentVersion(row),oldDoc=exerciseDocumentVersion(old),savedDoc=exerciseDocumentVersion(saved);
  if(doc!==oldDoc&&savedDoc!==oldDoc&&doc!==savedDoc)throw conflict(row.id);
  const merged={...saved},document=doc!==oldDoc?row:saved;
  for(const key of documentFields){if(Object.hasOwn(document,key))merged[key]=document[key];else delete merged[key];}
  const localTask=fields(row,taskFields),oldTask=fields(old,taskFields),remoteTask=fields(saved,taskFields),task=equal(localTask,oldTask)?saved:equal(remoteTask,oldTask)?row:newestTask(row,saved);
  for(const key of taskFields){if(Object.hasOwn(task,key))merged[key]=task[key];else delete merged[key];}
  for(const key of new Set([...Object.keys(old),...Object.keys(row),...Object.keys(saved)])){
   if(documentFields.has(key)||taskFields.has(key)||equal(old[key],row[key]))continue;
   if(key==='imageJobs'){
    const jobs={...saved.imageJobs};
    for(const id of new Set([...Object.keys(old.imageJobs||{}),...Object.keys(row.imageJobs||{})])){
     const before=old.imageJobs?.[id],local=row.imageJobs?.[id],remote=saved.imageJobs?.[id];
     if(equal(before,local))continue;
     if(!equal(before,remote)&&!equal(local,remote)){
      if(!local||!remote||local.id!==remote.id)throw conflict(row.id);
      jobs[id]=newestTask(local,remote);
     }else if(local)jobs[id]=local;else delete jobs[id];
    }
    merged.imageJobs=jobs;continue;
   }
   if(!equal(old[key],saved[key])&&!equal(row[key],saved[key]))throw conflict(row.id);
   if(Object.hasOwn(row,key))merged[key]=row[key];else delete merged[key];
  }
  result.set(row.id,merged);
 }
 return structuredClone([...result.values()]);
}
// Preserve object identity for in-flight jobs and retain edits typed while the
// IndexedDB transaction was pending. Their original baseline stays for retry.
export function settleExerciseRecords(live,snapshot,saved){
 const before=new Map(snapshot.map(r=>[r.id,r])),stored=new Map(saved.map(r=>[r.id,r])),baseline=new Map(saved.map(r=>[r.id,r])),rows=[];
 for(const row of live){
  const previous=before.get(row.id),next=stored.get(row.id);
  if(equal(exerciseRecordSnapshot([row])[0],previous)){
   if(!next)continue;
   syncObject(row,next,{root:true});
  }else if(previous)baseline.set(row.id,previous);else baseline.delete(row.id);
  rows.push(row);stored.delete(row.id);
 }
 rows.push(...structuredClone([...stored.values()]));
 return {rows,baseline:structuredClone([...baseline.values()])};
}
export function exerciseModificationCopy(row,{id,at=Date.now()}={}){
 if(!row?.sheet)throw new Error('练习尚未成稿，请先同步后台任务。');
 const copy=exerciseRecordSnapshot([row])[0];
 for(const key of taskFields)if(!['model','provider','reasoningEffort','generatedAt','templateVersion','templateId','usage'].includes(key))delete copy[key];
 copy.id=id;copy.localCopyOf=row.localCopyOf||row.id;copy.createdAt=at;copy.reviewedAt=null;copy.status='ready';copy.imageJobs={};delete copy.removed;
 return copy;
}
