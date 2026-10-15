import test from 'node:test';import assert from 'node:assert/strict';
import {syncExerciseTasks,exerciseSyncDelay,exerciseSyncMessage,exerciseImageRecovery,exerciseJobRecovery} from '../app/engine/exercise-sync.js';
test('慢任务不阻塞其它状态查询，连接并发有上限，停止后不启动后续任务',async()=>{
 let release;const blocked=new Promise(r=>release=r),visited=[],finished=[];let running=0,maximum=0,active=true;
 const task=syncExerciseTasks([1,2,3,4,5],async id=>{visited.push(id);maximum=Math.max(maximum,++running);if(id===1)await blocked;finished.push(id);running--;if(id===4)active=false;},{concurrency:2,active:()=>active});
 await new Promise(r=>setImmediate(r));assert.deepEqual(visited,[1,2,3,4]);assert.deepEqual(finished,[2,3,4]);assert.equal(maximum,2);release();await task;assert(!visited.includes(5));
});
test('即使无生成任务，未同步的删除也持续重试；离线或验证到期放缓查询',()=>{
 assert.equal(exerciseSyncDelay(),null);assert.equal(exerciseSyncDelay({deletions:true}),30000);assert.equal(exerciseSyncDelay({deletions:true,online:false}),15000);assert.equal(exerciseSyncDelay({pending:true}),4000);assert.equal(exerciseSyncDelay({pending:true,authenticated:false}),15000);assert.equal(exerciseSyncDelay({pending:true,sessionChanged:true}),0);
});
test('同步反馈区分空闲、离线、待验证与连接异常，并包含插图任务',()=>{
 const ready={status:'ready',sheet:{}};assert.match(exerciseSyncMessage([ready]),/没有进行中/);
 const pending={status:'running'};assert.match(exerciseSyncMessage([pending],{online:false}),/联网后自动同步/);assert.match(exerciseSyncMessage([pending],{authenticated:false}),/验证动态码/);assert.match(exerciseSyncMessage([pending]),/1个任务/);assert.match(exerciseSyncMessage([{...ready,imageJobs:{one:{status:'running',syncIssue:'network'}}}]),/自动重连/);
});

test('已接收后过期或删除的插图不自动重新提交，只有未确认任务可按原ID恢复',()=>{
 for(const job of [{status:'queued'},{status:'running'},{status:'unconfirmed',acceptedAt:100}])assert.equal(exerciseImageRecovery(job,'JOB_NOT_FOUND'),'failed');
 assert.equal(exerciseImageRecovery({status:'unconfirmed'},'JOB_NOT_FOUND'),'replay');assert.equal(exerciseImageRecovery({status:'submitting'},'JOB_REMOVED'),'failed');assert.equal(exerciseImageRecovery({status:'running'},'NETWORK_TIMEOUT'),'wait');
 for(const status of ['failed','ready','queued','running'])assert.equal(exerciseJobRecovery({status},'JOB_NOT_FOUND'),'failed');assert.equal(exerciseJobRecovery({status:'unconfirmed'},'JOB_NOT_FOUND'),'replay');
});
import {mergeJobSnapshot,jobSnapshotCurrent} from '../app/engine/exercise-jobs.js';
test('继续题组后，旧失败查询不能覆盖新任务状态',()=>{const record={status:'running',resumeAvailable:false,groupRevision:4};assert(!jobSnapshotCurrent(record,{status:'failed',groupRevision:2}));assert.equal(mergeJobSnapshot(record,{status:'failed',groupRevision:2}),false);assert.equal(record.status,'running');mergeJobSnapshot(record,{status:'ready',groupRevision:5,completedQuestions:6});assert.equal(record.status,'ready');assert.equal(record.groupRevision,5);});
