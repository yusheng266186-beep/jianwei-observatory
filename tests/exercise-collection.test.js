import test from 'node:test';
import assert from 'node:assert/strict';
import {filterExerciseJobs,jobState} from '../app/engine/exercise-jobs.js';
import {exerciseSelection,exerciseRemovalPlan} from '../app/engine/exercise-collection.js';
import {installExerciseChoices} from '../app/ui/exercise-choice.js';
const task=(id,extra={})=>({id,createdAt:100,status:'ready',sheet:{title:'函数专题'},student:{name:'林同学',classNo:4,examLabel:'十月月考'},request:{subject:'数学',focus:'导数与切线',curriculum:'函数与导数',targets:['导数运算']},...extra});
const ids=rows=>rows.map(r=>r.id);
test('组合关键词按交集检索，不要求学生、学科和知识点在文字中连续',()=>{
 const rows=[task('a'),task('b',{student:{name:'陈同学',classNo:4},request:{subject:'物理',focus:'受力分析'}})];assert.deepEqual(ids(filterExerciseJobs(rows,{query:'林同学 数学 导数'})),['a']);assert.deepEqual(ids(filterExerciseJobs(rows,{query:'导数 林同学'})),['a']);assert.deepEqual(ids(filterExerciseJobs(rows,{query:'林同学 物理'})),[]);
});
test('关键词支持全角数字和空格、大小写以及教学范围与目标',()=>{
 const row=task('a',{sheet:{title:'DNA专题'},request:{subject:'生物',focus:'遗传',curriculum:'减数分裂',targets:['基因重组']}});assert.equal(filterExerciseJobs([row],{query:'４班　dna 基因重组 减数分裂'}).length,1);assert.equal(filterExerciseJobs([row],{query:'十月 月考'}).length,1);
});
test('班级、学科、状态与关键词组合，不把其他班同名学生的记录混进来',()=>{
 const rows=[task('a'),task('b',{student:{name:'林同学',classNo:7}}),task('c',{request:{subject:'物理',focus:'受力'}})];assert.deepEqual(ids(filterExerciseJobs(rows,{query:'林同学',classNo:'4',subject:'数学',status:'ready'})),['a']);assert.deepEqual(ids(filterExerciseJobs(rows,{classNo:'全部班级'})),[]);
});
test('独立的班级和学科关键词精确匹配，4班不匹配14班，数学不误中物理的方法描述',()=>{
 const rows=[task('math'),task('other-class',{student:{name:'林同学',classNo:14}}),task('physics',{request:{subject:'物理',focus:'用数学方法分析物理情境',curriculum:'数学函数与运动图像'}})];assert.deepEqual(ids(filterExerciseJobs(rows,{query:'４班 数学'})),['math']);assert.deepEqual(ids(filterExerciseJobs(rows,{query:'14班 数学'})),['other-class']);assert.deepEqual(ids(filterExerciseJobs(rows,{query:'物理 数学方法'})),['physics']);
});
test('待审题、已审题、已生成分组明确，单独绘图仍属于进行中',()=>{
 const ready=task('a'),reviewed=task('b',{reviewedAt:'yes'}),image=task('c',{imageJobs:{1:{status:'running'}}}),rows=[ready,reviewed,image];assert.deepEqual(ids(filterExerciseJobs(rows,{status:'ready'})),['a']);assert.deepEqual(ids(filterExerciseJobs(rows,{status:'reviewed'})),['b']);assert.deepEqual(ids(filterExerciseJobs(rows,{status:'done'})),['a','b']);assert.equal(jobState(image),'pending');
});
test('使用界面的身份描述参与班级与姓名检索，并保留原记录',()=>{
 const row=task('a'),before=structuredClone(row);assert.equal(filterExerciseJobs([row],{identify:()=>({name:'显示姓名',classNo:17,exam:'显示考次'}),query:'显示姓名 显示考次',classNo:'17'}).length,1);assert.deepEqual(row,before);
});
test('默认排序保留进行中优先，其他排列方式按所选规则且不改变原数组',()=>{
 const old=task('old',{createdAt:10}),fresh=task('new',{createdAt:30}),pending=task('pending',{createdAt:5,status:'running'}),rows=[fresh,old,pending],before=[...rows];assert.deepEqual(ids(filterExerciseJobs(rows)),['pending','new','old']);assert.deepEqual(ids(filterExerciseJobs(rows,{sort:'newest'})),['new','old','pending']);assert.deepEqual(ids(filterExerciseJobs(rows,{sort:'oldest'})),['pending','old','new']);assert.deepEqual(rows,before);
});
test('姓名排序支持自然数字顺序，同名同时间用ID稳定排列',()=>{
 const rows=[task('b',{student:{name:'校检10'}}),task('a',{student:{name:'校检2'}}),task('c',{student:{name:'校检2'}})];assert.deepEqual(ids(filterExerciseJobs(rows,{sort:'name'})),['a','c','b']);
});
test('空关键词不限制列表，检索可匹配旧记录的describe描述',()=>{
 assert.equal(filterExerciseJobs([task('a')],{query:'　\n  '}).length,1);assert.equal(filterExerciseJobs([task('a')],{query:'旧称 同学',describe:()=> '旧称 同学'}).length,1);
});
test('按筛选保留选择，未知ID与筛选外记录不会进入批量操作',()=>{
 const rows=[task('a'),task('b')],before=structuredClone(rows);assert.deepEqual(ids(exerciseSelection(rows,['a','unknown','a'])),['a']);assert.deepEqual(ids(exerciseSelection([rows[1]],['a','b'])),['b']);assert.deepEqual(rows,before);
});
test('批量删除冻结原ID，后到的新失败任务不会被扩大纳入',()=>{
 const rows=[task('a',{status:'failed'}),task('b',{status:'failed'})],frozen=['a'];const plan=exerciseRemovalPlan(rows,frozen,{failedOnly:true});assert.deepEqual(plan.ids,['a']);assert.equal(plan.count,1);
});
test('失败清理确认前重新核对，已经恢复成稿和图示仍运行的任务不会被清理',()=>{
 const rows=[task('a',{status:'failed'}),task('b'),task('c',{status:'failed',imageJobs:{1:{status:'running'}}})];assert.deepEqual(exerciseRemovalPlan(rows,['a','b','c'],{failedOnly:true}).ids,['a']);
});
test('删除预览准确统计进行中和已审题项目，移除的任务不再计数',()=>{
 const rows=[task('a',{status:'running'}),task('b',{reviewedAt:'yes'}),task('c')];assert.deepEqual(exerciseRemovalPlan(rows,['a','b','c','missing']),{ids:['a','b','c'],count:3,pending:1,reviewed:1});assert.equal(exerciseRemovalPlan([],['a']).count,0);
});
test('篡改或未知筛选值不会放宽到全体记录，合法排序结果稳定',()=>{
 const rows=[task('a'),task('b')];assert.deepEqual(filterExerciseJobs(rows,{status:'not-a-state'}),[]);assert.deepEqual(filterExerciseJobs(rows,{subject:'不存在'}),[]);assert.deepEqual(ids(filterExerciseJobs(rows,{sort:'unknown'})),['a','b']);
});
test('大量匹配记录只返回原对象，筛选与排序不修改审批或图示内容',()=>{
 const rows=Array.from({length:300},(_,i)=>task(String(i),{createdAt:i,reviewedAt:i%2?'yes':null})),before=JSON.stringify(rows),result=filterExerciseJobs(rows,{subject:'数学',status:'ready',query:'林 导数'});assert.equal(result.length,150);assert(result.every(r=>rows.includes(r)));assert.equal(JSON.stringify(rows),before);
});
test('下拉菜单销毁时移除窗口、文档和根节点监听，重复进入不会叠加旧回调',()=>{
 class Probe extends EventTarget{calls=0;addEventListener(type,callback,options){super.addEventListener(type,e=>{this.calls++;callback(e);},options);}closest(){return null;}}
 const previous={window:globalThis.window,document:globalThis.document},root=new Probe(),doc=new Probe(),win=new Probe();win.visualViewport=new Probe();globalThis.window=win;globalThis.document=doc;
 try{const menu=installExerciseChoices(root,()=>{});win.dispatchEvent(new Event('resize'));doc.dispatchEvent(new Event('scroll'));assert.equal(win.calls,1);assert.equal(doc.calls,1);menu.destroy();win.dispatchEvent(new Event('resize'));doc.dispatchEvent(new Event('scroll'));root.dispatchEvent(new Event('click'));assert.equal(win.calls,1);assert.equal(doc.calls,1);assert.equal(root.calls,0);}finally{for(const key of ['window','document'])if(previous[key]===undefined)delete globalThis[key];else globalThis[key]=previous[key];}
});
