import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeNotebook,mergePlans,settleNotebook,mergeNotebookRestore,mergeRestoredExerciseRecords,mergeRestoredComposerDrafts,recordPlanText,applyPlanText} from '../app/data/workspace-merge.js';
import {createExerciseDrafts,exerciseDraftKey,mergeExerciseComposer} from '../app/engine/exercise-drafts.js';
import {fourSheetBundle,fourSheetFilename} from '../app/engine/export-scope.js';
import {Atlas} from '../app/engine/atlas.js';
import {parseFlat} from '../app/data/parser.js';
import {createCheckpointScheduler,tracksStudyScroll} from '../app/engine/checkpoint-policy.js';

test('双页编辑不同摘录互不覆盖，同份不同字段合并，同字段分歧保留本地副本',()=>{
 const base=[{id:'a',note:'原判断',title:'标题'},{id:'b',note:'另一份'}];
 const local=structuredClone(base),remote=structuredClone(base);local[0].note='本页判断';remote[1].note='另一页判断';
 assert.deepEqual(mergeNotebook(base,local,remote).records.map(n=>n.note),['本页判断','另一页判断']);
 remote[0].title='另一页标题';assert.equal(mergeNotebook(base,local,remote).records[0].title,'另一页标题');
 remote[0].note='另一页同份判断';const result=mergeNotebook(base,local,remote,{newId:()=> 'copy',now:()=>42});
 assert.equal(result.records[0].note,'另一页同份判断');assert.equal(result.records.find(n=>n.id==='copy').note,'本页判断');assert.deepEqual(result.remaps,[['a','copy']]);
 assert.deepEqual(mergePlans(base,local,remote,{newId:()=> 'copy',now:()=>42}),result);
 const afterDelete=mergeNotebook(base,[base[1]],[{...base[0],note:'删除时另一页在修改'},base[1]]);assert.equal(afterDelete.records.length,2);
});
test('保存过程中继续输入不被旧快照覆盖；未改动记录接受远端更新且保持对象身份',()=>{
 const live=[{id:'a',note:'a'},{id:'b',note:'b'}],snapshot=structuredClone(live),identity=live[1];live[0].note='继续输入';
 const result=settleNotebook(live,snapshot,[{id:'a',note:'a'},{id:'b',note:'另一页更新'},{id:'c',note:'新增'}]);
 assert.equal(result[0].note,'继续输入');assert.equal(result[1],identity);assert.equal(identity.note,'另一页更新');assert.equal(result[2].id,'c');
 assert.equal(mergeNotebookRestore(result,[{id:'a',note:'旧备份'}]).records[0].note,'继续输入');
});
test('恢复旧练习不覆盖较新题文、审题与0反馈，差异副本重复导入保持幂等',()=>{
 const old={id:'job',sheet:{title:'旧题文'},reviewedAt:'旧审题',practiceFeedback:{scores:[1]}},local={...old,sheet:{title:'已修正'},reviewedAt:'新审题',practiceFeedback:{scores:[0]}};
 const first=mergeRestoredExerciseRecords([local],[old],{newId:()=> 'backup-copy'});
 assert.deepEqual(first.records[0],local);assert.equal(first.copies,1);assert.equal(first.records[1].reviewedAt,'旧审题');
 const second=mergeRestoredExerciseRecords(first.records,[old],{newId:()=> 'must-not-add'});assert.equal(second.records.length,2);assert.equal(second.copies,0);
});
test('实际序列化的训练草稿按学生映射恢复，保留本机草稿、训练依据与手填重点',()=>{
 const request={subject:'数学',focus:'手填重点',count:3},oldKey=exerciseDraftKey({sid:'old',exam:'52'},'数学'),newKey=exerciseDraftKey({sid:'new',exam:'52'},'数学');
 const source=mergeExerciseComposer(null,[[oldKey,{request,basis:{mode:'common',exams:['51','52']},applied:true,focuses:[[JSON.stringify([oldKey,'common',['51','52']]),'手填重点']]}]]);
 const restored=mergeRestoredComposerDrafts(null,source,{remap:new Map([['old','new']])}),drafts=createExerciseDrafts();drafts.restore(restored);
 assert.deepEqual(drafts.get(newKey),request);assert(drafts.isApplied(newKey));assert.equal(drafts.focus(newKey,{mode:'common',exams:['51','52']},''),'手填重点');assert.equal(restored.bases[0][0],newKey);
 const latest=mergeExerciseComposer(null,[[newKey,{request:{...request,focus:'较新'},basis:{mode:'manual',exams:[]},focuses:[]}]]);
 assert.equal(new Map(mergeRestoredComposerDrafts(latest,source,{remap:new Map([['old','new']])}).requests).get(newKey).focus,'较新');
});
test('训练文字日志保留最后一次输入，忽略非文字结构与大型练习',()=>{
 const plan={id:'p',note:'原文',training:{exercise:{large:'不应复制'}}};let journal=recordPlanText({},plan,'note','新文');journal=recordPlanText(journal,plan,'training.goal','新目标');journal=recordPlanText(journal,plan,'training.exercise','不接受');
 assert.equal(JSON.stringify(journal).includes('不应复制'),false);const next=structuredClone(plan);applyPlanText(journal,next);assert.equal(next.note,'新文');assert.equal(next.training.goal,'新目标');assert.deepEqual(next.training.exercise,plan.training.exercise);
});
test('四表包跟随选择的考次，单次数据、文件名及范围说明一致',()=>{
 const atlas=new Atlas(parseFlat([['姓名','班级','考试','总分'],['匿名',4,'51',400],['匿名',4,'52',500]],'匿名.csv'));
 const pack=fourSheetBundle(atlas,{exam:'51',comparison:'51'});assert.equal(pack.scope.exam,'51');assert.equal(pack.scope.comparison,'');
 const sheet=pack.sheets['班级成绩分析单次'];assert.equal(sheet.length,2);assert(sheet[1].includes(400));assert(!sheet[1].includes(500));
 assert.match(fourSheetFilename('荣县',pack.scope),/51/);assert(pack.sheets['导出范围'].some(row=>row[1].includes('51')));
});
test('两级滚动保存共用一次几何快照，后续变化失效且忽略无关弹层滚动',()=>{
 let count=0;const timers=new Map(),saved=[],scheduler=createCheckpointScheduler({snapshot:()=>({count:++count}),checkpoint:s=>saved.push(s),archive:s=>saved.push(s),setTimer:(fn,ms)=>(timers.set(ms,fn),ms),clearTimer:ms=>timers.delete(ms)});
 scheduler.schedule();timers.get(120)();timers.get(500)();assert.equal(count,1);assert.equal(saved[0],saved[1]);scheduler.invalidate();scheduler.flush();assert.equal(count,2);
 assert.equal(tracksStudyScroll({closest:selector=>selector.includes('.report-scroll')?{}:null}),false);
 assert.equal(tracksStudyScroll({closest:selector=>selector==='#stage,#research-drawer'?{}:null}),true);
});
