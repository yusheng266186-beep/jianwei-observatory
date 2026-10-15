// Keep independent status reads moving when one task's connection is slow.
export async function syncExerciseTasks(tasks,visit,{concurrency=3,active=()=>true}={}){
 let next=0;
 async function consume(){while(active()&&next<tasks.length){const task=tasks[next++];await visit(task);}}
 await Promise.all(Array.from({length:Math.min(tasks.length,Math.max(1,Math.floor(concurrency)||1))},consume));
}
export function exerciseSyncDelay({pending=false,deletions=false,online=true,authenticated=true,hidden=false,sessionChanged=false}={}){
 if(!pending&&!deletions)return null;
 if(sessionChanged)return 0;
 if(!online||!authenticated||hidden)return 15000;
 return pending?4000:30000;
}
export function exerciseSyncMessage(records,{online=true,authenticated=true}={}){
 const pending=records.filter(r=>['submitting','unconfirmed','queued','running'].includes(r.status)||Object.values(r.imageJobs||{}).some(j=>['submitting','unconfirmed','queued','running'].includes(j.status)));
 if(!pending.length)return '当前没有进行中的任务；已保存的练习可继续查看和导出。';
 if(!online)return '当前离线，已确认提交的任务继续在云端生成；联网后自动同步。';
 if(!authenticated)return '请验证动态码，继续同步原任务。';
 if(pending.some(r=>r.syncIssue||Object.values(r.imageJobs||{}).some(j=>j.syncIssue)))return '部分任务暂未取得最新状态，正在自动重连；无需重复生成。';
 return '任务状态已更新，'+pending.length+'个任务仍在后台处理。';
}
// Only a never-acknowledged submission may be replayed under its original ID.
// Missing accepted jobs are expired, never an invitation to start paid work again.
export function exerciseImageRecovery(job,code){
 if(code==='JOB_REMOVED'||code==='JOB_EXPIRED')return 'failed';
 if(code!=='JOB_NOT_FOUND')return 'wait';
 return job.acceptedAt||['queued','running'].includes(job.status)?'failed':'replay';
}
