export const pendingJob=record=>['submitting','unconfirmed','queued','running'].includes(record?.status);
export const pendingImages=record=>Object.values(record.imageJobs||{}).some(pendingJob);
export function jobState(record){if(pendingJob(record))return 'pending';if(pendingImages(record))return 'pending';if(record.status==='ready'&&record.sheet)return record.reviewedAt?'reviewed':'ready';return 'failed';}
export function jobStateLabel(record){if(record.status==='running'&&record.progress?.phase)return ({connecting:'正在连接模型',thinking:'模型正在推演',writing:'正在输出练习',validating:'正在校验成稿'}[record.progress.phase]||'模型生成中');if(pendingImages(record)&&!pendingJob(record))return '插图生成中';return {submitting:'正在确认提交',unconfirmed:'提交待确认',queued:'后台排队中',running:'模型生成中',failed:'生成未完成',ready:record.reviewedAt?'已审题':'待审题'}[record.status]||'等待查询';}
export const jobSnapshotCurrent=(record,data)=>!Number.isFinite(record.groupRevision)||!Number.isFinite(data.groupRevision)||data.groupRevision>=record.groupRevision;
export function mergeJobSnapshot(record,data,at=Date.now()){
 if(!jobSnapshotCurrent(record,data))return false;
 const snapshot=()=>JSON.stringify([record.status,record.failure,record.syncIssue,record.startedAt,record.finishedAt,record.model,record.provider,record.reasoningEffort,record.resumeAvailable,record.completedQuestions,record.groupIndex,record.groupCount,record.groupRevision]),old=snapshot();
 record.status=data.status;record.resumeAvailable=!!data.resumeAvailable;for(const field of ['completedQuestions','groupIndex','groupCount','groupRevision'])if(Number.isFinite(data[field]))record[field]=data[field];record.lastCheckedAt=at;if(data.progress&&typeof data.progress==='object')record.progress=data.progress;record.syncIssue='';
 for(const field of ['startedAt','finishedAt','serverTime','deadlineAt'])if(Number.isFinite(data[field]))record[field]=data[field];
 for(const field of ['model','provider','reasoningEffort'])if(typeof data[field]==='string')record[field]=data[field];
 if(Number.isFinite(data.createdAt))record.serverCreatedAt=data.createdAt;
 record.acceptedAt=record.acceptedAt||data.createdAt||at;
 if(!data.error)delete record.failure;
 return old!==snapshot();
}
export function jobTiming(record,history=[],at=Date.now()){
 const image=pendingImages(record)&&!pendingJob(record),count=Number(record.request?.count)||6,gemini=!record.model||record.provider==='gemini'||record.model==='gemini-3.8-flash',ceiling=gemini?420:840,sameModel=r=>(r.model||'gemini-3.8-flash')===(record.model||'gemini-3.8-flash')&&(r.provider||'gemini')===(record.provider||'gemini')&&(r.reasoningEffort||'max')===(record.reasoningEffort||'max');
 let low=image?120:!gemini?90+count*12:40+count*8,high=image?330:!gemini?240+count*35:90+count*18;
 const groups=Number(record.progress?.partCount)||Number(record.groupCount)||1;if(!image&&groups>1){low=groups*(gemini?40+(count/groups)*8:90+(count/groups)*12);high=groups*(gemini?90+(count/groups)*18:240+(count/groups)*35);}
 const samples=history.filter(r=>r!==record&&r.status==='ready'&&sameModel(r)&&r.request?.subject===record.request?.subject&&Math.abs((r.request.count||0)-count)<=2&&Number.isFinite(r.finishedAt)&&Number.isFinite(r.startedAt)&&r.finishedAt>r.startedAt).map(r=>(r.finishedAt-r.startedAt)/1000).filter(v=>v>=10&&v<=ceiling).slice(-12).sort((a,b)=>a-b);
 if(!image&&samples.length>=3){const middle=samples[Math.floor(samples.length/2)];low=Math.max(25,Math.round(middle*.7));high=Math.min(ceiling,Math.max(low+30,Math.round(middle*1.6)));}
 const progress=image?Object.values(record.imageJobs||{}).find(pendingJob)||record:record;
 const start=progress.startedAt||progress.acceptedAt||progress.serverCreatedAt||progress.createdAt||record.createdAt||at;
 const elapsed=Math.max(0,Math.floor((Number.isFinite(progress.serverTime)&&progress.lastCheckedAt?progress.serverTime-start+at-progress.lastCheckedAt:at-start)/1000));
 const estimate=(!gemini&&samples.length<3&&!image?'预计约':'通常约')+Math.max(1,Math.floor(low/60))+'–'+Math.max(2,Math.ceil(high/60))+'分钟';
 const elapsedLabel='已等待 '+(elapsed<60?elapsed+'秒':Math.floor(elapsed/60)+'分'+elapsed%60+'秒');
 return {low,high,elapsed,estimate,elapsedLabel,overdue:elapsed>high,label:elapsed>high?'已超过通常用时，后台状态仍在查询':estimate+' · '+elapsedLabel};
}
export function jobConnection(record,online=true){
 if(pendingImages(record)&&!pendingJob(record))record=Object.values(record.imageJobs).find(pendingJob)||record;
 if(!online||record.syncIssue==='offline')return record.acceptedAt||['queued','running'].includes(record.status)?'当前离线，云端任务继续；联网后自动同步':'等待联网确认提交，已保留本次设置';
 if(record.syncIssue==='auth')return '请验证动态码，继续同步原任务';
 if(record.syncIssue)return '连接暂时中断，正在自动重连原任务';
 if(record.status==='unconfirmed'||record.status==='submitting')return '正在确认后台接收情况，恢复时沿用同一任务';
 return '后台独立处理，关闭页面后仍会继续';
}
export function filterExerciseJobs(records,{status='all',query='',describe=()=>''}={}){
 const text=query.trim().toLocaleLowerCase();return records.filter(r=>{const state=jobState(r);return (status==='all'||status==='pending'&&state==='pending'||status==='done'&&['ready','reviewed'].includes(state)||status===state)&&(!text||[describe(r),r.request?.subject,r.request?.focus,r.sheet?.title,r.student?.name,r.student?.classNo&&r.student.classNo+'班'].filter(Boolean).join(' ').toLocaleLowerCase().includes(text));}).sort((a,b)=>(jobState(a)==='pending'?0:1)-(jobState(b)==='pending'?0:1)||(b.createdAt||0)-(a.createdAt||0));
}
