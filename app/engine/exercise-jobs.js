export const pendingJob=record=>['submitting','unconfirmed','queued','running'].includes(record?.status);
export const pendingImages=record=>Object.values(record.imageJobs||{}).some(pendingJob);
export function jobState(record){if(record.status==='prepared')return 'prepared';if(pendingJob(record))return 'pending';if(pendingImages(record))return 'pending';if(record.status==='ready'&&record.sheet)return record.reviewedAt?'reviewed':'ready';return 'failed';}
export function jobStateLabel(record){if(record.status==='running'&&record.progress?.phase)return ({connecting:'正在连接模型',thinking:'模型正在推演',writing:'正在输出练习',validating:'正在校验成稿','figure-planning':'正在规划图示','figure-rendering':'正在绘制图示','figure-reviewing':'正在核对图题'}[record.progress.phase]||'模型生成中');if(pendingImages(record)&&!pendingJob(record))return '图示生成中';return {prepared:'等待提交',submitting:'正在确认提交',unconfirmed:'提交待确认',queued:'后台排队中',running:'模型生成中',failed:'生成未完成',ready:record.reviewedAt?'已审题':'待审题'}[record.status]||'等待查询';}
const figureRevisionOf=value=>Number.isFinite(value?.figureRevision)?value.figureRevision:Number.isFinite(value?.progress?.figureRevision)?value.progress.figureRevision:undefined;
export const jobSnapshotCurrent=(record,data)=>{
 if(Number.isFinite(record.groupRevision)&&Number.isFinite(data.groupRevision)&&data.groupRevision<record.groupRevision)return false;
 const current=figureRevisionOf(record),incoming=figureRevisionOf(data);
 if(Number.isFinite(current)&&Number.isFinite(incoming)&&incoming<current)return false;
 // A completed sheet never rolls back to a pending snapshot unless a newer
 // figure revision explicitly says otherwise.
 if(record.status==='ready'&&data.status&&data.status!=='ready'&&!(Number.isFinite(current)&&Number.isFinite(incoming)&&incoming>current))return false;
 return true;
};
export function mergeJobSnapshot(record,data,at=Date.now()){
 if(!jobSnapshotCurrent(record,data))return false;
 const incomingRevision=figureRevisionOf(data),revision=Number.isFinite(incomingRevision)?incomingRevision:figureRevisionOf(record);
 const snapshot=()=>JSON.stringify([record.status,record.failure,record.syncIssue,record.startedAt,record.finishedAt,record.model,record.provider,record.reasoningEffort,record.resumeAvailable,record.completedQuestions,record.groupIndex,record.groupCount,record.groupRevision,record.figurePipeline,record.figureStage,record.figureRevision,record.progress?.figureRevision]),old=snapshot();
 record.figurePipeline=!!data.figurePipeline;for(const field of ['figureStage','figureQuestion','figureCompleted','figureTotal','figureRevision'])if(data[field]!==undefined)record[field]=data[field];record.status=data.status;record.resumeAvailable=!!data.resumeAvailable;for(const field of ['completedQuestions','groupIndex','groupCount','groupRevision'])if(Number.isFinite(data[field]))record[field]=data[field];record.lastCheckedAt=at;if(data.progress&&typeof data.progress==='object')record.progress=data.progress;
 if(Number.isFinite(revision)){record.figureRevision=revision;if(!record.progress||typeof record.progress!=='object')record.progress={};record.progress.figureRevision=revision;}
 record.syncIssue='';
 for(const field of ['startedAt','finishedAt','serverTime','deadlineAt'])if(Number.isFinite(data[field]))record[field]=data[field];
 for(const field of ['model','provider','reasoningEffort'])if(typeof data[field]==='string')record[field]=data[field];
 if(Number.isFinite(data.createdAt))record.serverCreatedAt=data.createdAt;
 record.acceptedAt=record.acceptedAt||data.createdAt||at;
 if(!data.error)delete record.failure;
 return old!==snapshot();
}
export function jobTiming(record,history=[],at=Date.now()){
 const image=pendingImages(record)&&!pendingJob(record),count=Number(record.request?.count)||6,gemini=!record.model||record.provider==='gemini'||record.model==='gemini-3.8-flash',figures=record.progress?.figureTotal??(record.request?.visuals&&record.request.visuals!=='none'?Math.ceil(count/3):0),ceiling=figures?7200:gemini?420:840,sameModel=r=>(r.model||'gemini-3.8-flash')===(record.model||'gemini-3.8-flash')&&(r.provider||'gemini')===(record.provider||'gemini')&&(r.reasoningEffort||'max')===(record.reasoningEffort||'max')&&!!(r.progress?.figureTotal||r.request?.visuals&&r.request.visuals!=='none')===!!figures;
 let low=image?120:!gemini?90+count*12:40+count*8,high=image?330:!gemini?240+count*35:90+count*18;
 const groups=Number(record.progress?.partCount)||Number(record.groupCount)||1;if(!image&&groups>1){low=groups*(gemini?40+(count/groups)*8:90+(count/groups)*12);high=groups*(gemini?90+(count/groups)*18:240+(count/groups)*35);}
 if(!image&&figures){const retries=Number(record.progress?.figureStage?.attempt)||0;low+=figures*45+retries*45;high+=figures*240+retries*240;}
 const samples=history.filter(r=>r!==record&&r.status==='ready'&&sameModel(r)&&r.request?.subject===record.request?.subject&&Math.abs((r.request.count||0)-count)<=2&&Number.isFinite(r.finishedAt)&&Number.isFinite(r.startedAt)&&r.finishedAt>r.startedAt).map(r=>(r.finishedAt-r.startedAt)/1000).filter(v=>v>=10&&v<=ceiling).slice(-12).sort((a,b)=>a-b);
 if(!image&&samples.length>=3){const middle=samples[Math.floor(samples.length/2)];low=Math.max(25,Math.round(middle*.7));high=Math.min(ceiling,Math.max(low+30,Math.round(middle*1.6)));}
 const progress=image?Object.values(record.imageJobs||{}).find(pendingJob)||record:record;
 const start=progress.startedAt||progress.acceptedAt||progress.serverCreatedAt||progress.createdAt||record.createdAt||at;
 const elapsed=Math.max(0,Math.floor((Number.isFinite(progress.serverTime)&&progress.lastCheckedAt?progress.serverTime-start+at-progress.lastCheckedAt:at-start)/1000));
 const estimate=(!gemini&&samples.length<3&&!image?'预计约':'通常约')+Math.max(1,Math.floor(low/60))+'–'+Math.max(2,Math.ceil(high/60))+'分钟';
 const elapsedLabel='已等待 '+(elapsed<60?elapsed+'秒':Math.floor(elapsed/60)+'分'+elapsed%60+'秒');
 return {low,high,elapsed,estimate,elapsedLabel,overdue:elapsed>high,label:elapsed>high?elapsedLabel+' · 超过通常用时，后台状态仍在查询':estimate+' · '+elapsedLabel};
}
export function jobConnection(record,online=true){
 if(pendingImages(record)&&!pendingJob(record))record=Object.values(record.imageJobs).find(pendingJob)||record;
 if(!online||record.syncIssue==='offline')return record.acceptedAt||['queued','running'].includes(record.status)?'当前离线，云端任务继续；联网后自动同步':'等待联网确认提交，已保留本次设置';
 if(record.syncIssue==='auth')return '请验证动态码，继续同步原任务';
 if(record.syncIssue)return '连接暂时中断，正在自动重连原任务';
 if(record.status==='unconfirmed'||record.status==='submitting')return '正在确认后台接收情况，恢复时沿用同一任务';
 return '后台独立处理，关闭页面后仍会继续';
}
const jobNameOrder=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'});
const searchText=value=>String(value??'').normalize('NFKC').toLocaleLowerCase();
export function filterExerciseJobs(records,{status='all',query='',describe=()=>'',identify,subject='all',classNo='all',sort='priority'}={}){
 const terms=searchText(query).trim().split(/\s+/).filter(Boolean),states=new Map(),stateOf=r=>{if(!states.has(r))states.set(r,jobState(r));return states.get(r);},people=new Map(),person=r=>{if(!people.has(r))people.set(r,identify?identify(r):{name:r.student?.name,classNo:r.student?.classNo,exam:r.student?.examLabel});return people.get(r);};
 const matched=records.filter(r=>{
  const state=stateOf(r),p=person(r);if(!(status==='all'||status==='pending'&&state==='pending'||status==='done'&&['ready','reviewed'].includes(state)||status===state))return false;
  if(subject!=='all'&&r.request?.subject!==subject||classNo!=='all'&&String(p.classNo)!==String(classNo))return false;
  if(!terms.length)return true;
  const text=searchText([describe(r),p.name,p.classNo!=null?p.classNo+'班':'',p.exam,r.request?.subject,r.request?.focus,r.request?.curriculum,...(Array.isArray(r.request?.targets)?r.request.targets:[]),r.sheet?.title].filter(Boolean).join(' '));
  return terms.every(term=>{const classToken=term.match(/^(\d+)班$/);if(classToken)return Number(p.classNo)===Number(classToken[1]);if(/^(语文|数学|英语|日语|物理|化学|生物|政治|历史|地理)$/.test(term))return searchText(r.request?.subject)===term;return text.includes(term);});
 });
 return matched.sort((a,b)=>{
  if(sort==='name'){const names=jobNameOrder.compare(person(a).name||'',person(b).name||'');if(names)return names;}
  if(sort==='priority'){const pending=(stateOf(a)==='pending'?0:1)-(stateOf(b)==='pending'?0:1);if(pending)return pending;}
  return (sort==='oldest'?1:-1)*((a.createdAt||0)-(b.createdAt||0))||String(a.id).localeCompare(String(b.id));
 });
}
