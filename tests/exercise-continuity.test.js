import test from 'node:test';
import assert from 'node:assert/strict';
import {exerciseCatalog} from '../app/data/exercise-catalog.js';
import {EXERCISE_SUBJECTS} from '../app/engine/exercise-contract.js';
import {exerciseContentGroup,createExerciseContentPicker} from '../app/ui/exercise-content-picker.js';
import {saveExerciseSetup} from '../app/engine/exercise-setups.js';
import {createExerciseSetupShelf} from '../app/ui/exercise-setup-shelf.js';
import {exerciseWorkspaceHTML} from '../app/ui/exercise-workspace.js';
const request={subject:'数学',curriculum:'高中数学已学内容：解析几何',focus:'椭圆几何性质',targets:['椭圆几何性质'],count:3,minutes:15,difficulty:'基础巩固',visuals:'none'};
test('各学科从已有知识点恢复到对应板块，不改变原范围、目标或得分证据',()=>{
 for(const {id:subject} of EXERCISE_SUBJECTS)for(const group of exerciseCatalog(subject).groups){const topic=group.topics[0],r={...request,subject,curriculum:'',focus:topic,targets:[topic],evidence:[{knowledge:topic,score:0,max:5}]},before=structuredClone(r);assert.equal(exerciseContentGroup(r),group.name,subject+' / '+topic);assert.deepEqual(r,before);}
});
test('表内简称与手工教学范围可帮助定位，无法识别时提供稳定默认值',()=>{
 assert.equal(exerciseContentGroup({...request,focus:'椭圆',targets:['椭圆'],curriculum:''}),'解析几何');
 assert.equal(exerciseContentGroup({...request,focus:'',targets:[],curriculum:'高中数学已学内容：函数与导数'}),'函数与导数');
 assert.equal(exerciseContentGroup({...request,focus:'教师另定专题',targets:[],curriculum:''}),exerciseCatalog('数学').groups[0].name);
});
test('恢复草稿后清理前一搜索，教师主动浏览的章节不会在普通重绘时跳回',()=>{
 const picker=createExerciseContentPicker();picker.restore(request);assert.match(picker.options(request,[]),/<h5>椭圆/);
 picker.select('数学','复数');assert.match(picker.html(request,[]),/<h5>复数的概念<\/h5>/);assert.match(picker.html(request,[]),/<h5>复数的概念<\/h5>/);
 picker.search('数学','复数');picker.restore({...request,focus:'导数运算与切线',targets:['导数运算与切线']});const html=picker.html({...request,focus:'导数运算与切线',targets:['导数运算与切线']},[]);assert.match(html,/<h5>导数/);assert.match(html,/data-ai-knowledge-search value=""/);
});
test('从搜索点选知识点后提供该板块的方法重点，同时保留搜索与其他已选项',()=>{
 const picker=createExerciseContentPicker(),r={...request,focus:'导数运算与切线、椭圆几何性质',targets:['导数运算与切线','椭圆几何性质']},before=structuredClone(r);picker.search('数学','椭圆');picker.selectTopic('数学','椭圆几何性质');const html=picker.html(r,[]);assert.match(html,/联立后检验交点条件/);assert.match(html,/data-ai-knowledge-search value="椭圆"/);assert.match(html,/导数运算与切线/);assert.deepEqual(r,before);
});
test('折叠模板摘要按当前学科计数，能反映表单后续改动而不改模板',async()=>{
 const row=saveExerciseSetup([],request,{name:'椭圆训练',newId:()=> 'math'}).row;let current=structuredClone(request);const shelf=createExerciseSetupShelf({getRequest:()=>current,apply:()=>{}});shelf.load([row]);assert.match(shelf.summary(),/1 份/);shelf.choose(row.id);assert.match(shelf.summary(),/椭圆训练.*与草稿一致/);current.count=6;assert.doesNotMatch(shelf.summary(),/与草稿一致/);assert.equal(row.content.count,3);current={...current,subject:'语文'};assert.equal(shelf.summary(),'套用已保存设置');
});
test('模板保存尚未完成或失败时，不显示保存成功的模板计数',async()=>{
 let reject;const shelf=createExerciseSetupShelf({getRequest:()=>request,apply:()=>{},mutate:()=>new Promise((_,no)=>reject=no)});shelf.load([]);await shelf.handle('setup-edit');shelf.setName('椭圆训练');const pending=shelf.handle('setup-save');assert(shelf.pending);assert.equal(shelf.summary(),'套用已保存设置');reject(new Error('磁盘未完成'));await assert.rejects(pending,/磁盘未完成/);assert(!shelf.pending);assert.equal(shelf.summary(),'套用已保存设置');assert.match(shelf.html(),/data-ai-setup-name/);
});
test('换学生后摘要依据实际内容比较，不沿用上一位学生的已套用状态',async()=>{
 const row=saveExerciseSetup([],request,{name:'椭圆训练',newId:()=> 'math'}).row;let current=structuredClone(request);const shelf=createExerciseSetupShelf({getRequest:()=>current,apply:()=>{}});shelf.load([row]);shelf.choose(row.id);await shelf.handle('setup-apply');current={...current,focus:'',targets:[]};shelf.subjectChanged();assert.match(shelf.summary(),/当前设置不同/);assert.doesNotMatch(shelf.summary(),/本次设置已调整/);
});
test('模板保存期间更换学生，保存仍完成，但成功反馈不串到新学生的表单',async()=>{
 let key='学生甲',finish;const shelf=createExerciseSetupShelf({getRequest:()=>request,getContextKey:()=>key,apply:()=>{},mutate:reduce=>new Promise(resolve=>finish=()=>resolve(reduce([])))});shelf.load([]);await shelf.handle('setup-edit');shelf.setName('椭圆训练');const saving=shelf.handle('setup-save');key='学生乙';shelf.subjectChanged();finish();await saving;assert.match(shelf.summary(),/椭圆训练/);assert.doesNotMatch(shelf.html(),/已保存“椭圆训练”/);
});
test('新建页提供可读的暂存状态与快速保存入口，摘要中的文本按纯文本输出',()=>{
 const html=exerciseWorkspaceHTML({request,subjectHTML:'',templatesHTML:'',historyHTML:'',setupSummary:'<img src=x onerror=bad()>',draftStatus:'已自动暂存'});assert.match(html,/data-ai-draft-status role="status"/);assert.match(html,/保存为教学模板/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);
});
test('审题和等待页保留原流程与全部工具，不显示只属于编辑草稿的暂存条',()=>{
 for(const state of [{done:true},{pending:true},{partial:true}]){const html=exerciseWorkspaceHTML({request,subjectHTML:'学科控件',templatesHTML:'模板控件',historyHTML:'历史控件',...state});assert.match(html,/学科控件模板控件历史控件/);assert.doesNotMatch(html,/data-ai-draft-status/);if(state.done)assert.match(html,/按此设置新建/);if(state.pending)assert.match(html,/同步进度/);}
});
