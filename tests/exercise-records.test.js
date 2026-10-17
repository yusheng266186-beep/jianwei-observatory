import test from 'node:test';
import assert from 'node:assert/strict';
import {exerciseRecordSnapshot,mergeExerciseRecords,settleExerciseRecords,exerciseModificationCopy} from '../app/engine/exercise-records.js';
const row=()=>({id:'a',sid:'student',exam:'52',status:'ready',request:{subject:'数学'},sheet:{title:'练习',questions:[{id:1,stem:'原题',answer:'2'}]},reviewedAt:100});
test('旧页面关闭或保存其他任务，不覆盖另一页修改和新建的练习',()=>{
 const base=[row()],remote=structuredClone(base);remote[0].sheet.questions[0].stem='另一页修改';remote[0].reviewedAt=null;remote.push({...row(),id:'new'});
 assert.deepEqual(mergeExerciseRecords(base,structuredClone(base),remote),remote);
 const local=[...structuredClone(base),{id:'job',status:'running',request:{subject:'物理'}}];
 const saved=mergeExerciseRecords(base,local,remote);assert.equal(saved[0].sheet.questions[0].stem,'另一页修改');assert.deepEqual(saved.map(r=>r.id),['a','new','job']);
});
test('题目与审批作为一个版本保存，两个标签页的修改不会无声合并或覆盖',()=>{
 const base=[row()],local=structuredClone(base),remote=structuredClone(base);local[0].sheet.questions[0].answer='3';local[0].reviewedAt=null;remote[0].sheet.questions[0].stem='新题';remote[0].reviewedAt=200;
 assert.throws(()=>mergeExerciseRecords(base,local,remote),e=>e.code==='EXERCISE_SAVE_CONFLICT'&&e.recordId==='a');
 const approval=structuredClone(base);approval[0].reviewedAt=300;
 assert.throws(()=>mergeExerciseRecords(base,approval,remote),/其他页面修改/);
 assert.equal(remote[0].sheet.questions[0].stem,'新题');
});
test('已删除记录不复活，未保存修改可另存且必须重新审题',()=>{
 const base=[row()],local=structuredClone(base);assert.deepEqual(mergeExerciseRecords(base,local,[]),[]);
 local[0].sheet.questions[0].answer='3';assert.throws(()=>mergeExerciseRecords(base,local,[]),/删除/);
 assert.throws(()=>mergeExerciseRecords(base,local,base,{removed:['a']}),/删除/);
 const copy=exerciseModificationCopy({...local[0],service:'cloud',imageJobs:{1:{id:'old',status:'running'}}},{id:'copy',at:300});
 assert.equal(copy.localCopyOf,'a');assert.equal(copy.id,'copy');assert.equal(copy.reviewedAt,null);assert.equal(copy.service,'cloud');assert.deepEqual(copy.imageJobs,{});assert.equal(copy.sheet.questions[0].answer,'3');
 assert.deepEqual(mergeExerciseRecords([], [copy], []),[copy]);
});
test('练后结果与无冲突的题图排版可以独立保存，不回退后台任务状态',()=>{
 const base=[row()],local=structuredClone(base),remote=structuredClone(base);local[0].sheet.questions[0].figureLayout={widthPercent:55};local[0].reviewedAt=null;remote[0].practiceFeedback={updatedAt:200,rows:[{score:3}]};
 const [saved]=mergeExerciseRecords(base,local,remote);assert.equal(saved.sheet.questions[0].figureLayout.widthPercent,55);assert.equal(saved.practiceFeedback.rows[0].score,3);assert.equal(saved.reviewedAt,null);
 const old=[{id:'task',status:'queued',groupRevision:1}],a=[{...old[0],status:'running',lastCheckedAt:400}],b=[{...old[0],status:'ready',lastCheckedAt:300}];assert.equal(mergeExerciseRecords(old,a,b)[0].status,'ready');
 b[0].groupRevision=2;assert.equal(mergeExerciseRecords(old,a,b)[0].groupRevision,2);
});
test('写入过程中继续输入，保留未保存编辑与旧基准，下次仍能检测冲突',()=>{
 const base=[row()],captured=exerciseRecordSnapshot(base),live=structuredClone(base),remote=structuredClone(base);live[0].sheet.questions[0].answer='输入中的修改';remote[0].sheet.questions[0].stem='另一页的新题';remote[0].reviewedAt=null;
 const settled=settleExerciseRecords(live,captured,remote);assert.equal(settled.rows[0],live[0]);assert.equal(settled.rows[0].sheet.questions[0].answer,'输入中的修改');assert.deepEqual(settled.baseline,captured);assert.throws(()=>mergeExerciseRecords(settled.baseline,exerciseRecordSnapshot(settled.rows),remote),/其他页面修改/);
});
test('同步原地更新记录对象，保留本页流式显示，新记录也可见',()=>{
 const live=[row()];live[0].generationLog={outputText:'只在内存'};const captured=exerciseRecordSnapshot(live),remote=structuredClone(captured);remote[0].sheet.questions[0].answer='最新答案';remote[0].reviewedAt=null;remote.push({...row(),id:'new'});
 const original=live[0],settled=settleExerciseRecords(live,captured,remote);assert.equal(settled.rows[0],original);assert.equal(original.sheet.questions[0].answer,'最新答案');assert.equal(original.reviewedAt,null);assert.equal(original.generationLog.outputText,'只在内存');assert.equal(settled.rows.length,2);assert.deepEqual(settled.baseline,remote);
});
test('旧标签页不能覆盖另一页已提交的新练后结果，同样的双重保存可以合并',()=>{
 const base=[row()],a=structuredClone(base),b=structuredClone(base);a[0].practiceFeedback={updatedAt:200,score:3};b[0].practiceFeedback={updatedAt:300,score:4};
 assert.throws(()=>mergeExerciseRecords(base,a,b),/其他页面修改/);assert.deepEqual(mergeExerciseRecords(base,a,a),a);
});
test('不同题目的图示任务独立合并，同一绘图任务的旧快照不回退终态',()=>{
 const base=[row()],a=structuredClone(base),b=structuredClone(base);a[0].imageJobs={1:{id:'figure-1',status:'running'}};b[0].imageJobs={2:{id:'figure-2',status:'running'}};
 const merged=mergeExerciseRecords(base,a,b);assert.deepEqual(Object.keys(merged[0].imageJobs),['1','2']);
 const old=structuredClone(merged),local=structuredClone(old),remote=structuredClone(old);local[0].imageJobs[1]={id:'figure-1',status:'running',lastCheckedAt:200};remote[0].imageJobs[1]={id:'figure-1',status:'ready',lastCheckedAt:100};
 assert.equal(mergeExerciseRecords(old,local,remote)[0].imageJobs[1].status,'ready');
 remote[0].imageJobs[1]={id:'another-figure',status:'running'};assert.throws(()=>mergeExerciseRecords(old,local,remote),/其他页面修改/);
});
test('保存与跨页同步保留在途绘图任务引用，返回的响应仍写入当前记录',()=>{
 const r=row(),job={id:'figure',status:'running',lastCheckedAt:100};r.imageJobs={1:job};const captured=exerciseRecordSnapshot([r]),remote=structuredClone(captured);remote[0].imageJobs[1].lastCheckedAt=200;
 const settled=settleExerciseRecords([r],captured,remote);assert.equal(settled.rows[0].imageJobs[1],job);assert.equal(job.lastCheckedAt,200);job.status='ready';
 const [saved]=mergeExerciseRecords(settled.baseline,exerciseRecordSnapshot(settled.rows),remote);assert.equal(saved.imageJobs[1].status,'ready');
});
