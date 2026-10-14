import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {Atlas} from '../app/engine/atlas.js';import {buildTeachingReport} from '../app/engine/reports.js';import {documentSections,wordFiles,pdfDefinition} from '../app/io/print-document.js';
import {validDate,dateLabel,dateChoices,planMatchesTime,questionOptions,draftForPlan,selectedPlans,snapshotQuestion} from '../app/engine/training.js';
const {makeFixture}=createRequire(import.meta.url)('./fixtures.cjs');
const atlas=()=>new Atlas(makeFixture());
test('班级特控/本科名单只列有效线下观察带，0与缺失不混淆，任务未设置不编造',()=>{
 const a=atlas(),r=buildTeachingReport(a,{kind:'class',no:4,exam:'52',band:20});const under=r.sections.find(s=>s.title==='本科突破对象');assert.equal(under.rows.length,3);assert.deepEqual(under.rows.map(r=>r[2]),['-5.0','-10.0','-20.0']);assert(!under.rows.some(r=>r[0]===a.name('test-4-1')));assert.match(under.caption,/不代表|线下/);assert(r.sections.find(s=>s.title==='班级小题表现').rows.some(r=>r[4]==='—'));
});
test('学科报告纳入总分已达线的薄弱学生，英语日语统一比较而保留两份原题',()=>{
 const a=atlas(),r=buildTeachingReport(a,{kind:'subject',no:'all',subject:'英语',exam:'52'});assert.equal(r.spec.subject,'外语');const qs=r.sections.find(s=>s.title==='全卷题目与知识点').rows;assert(qs.some(r=>r[0].startsWith('英语')));assert(qs.some(r=>r[0].startsWith('日语')));
 const math=buildTeachingReport(a,{kind:'subject',no:4,subject:'数学',exam:'52'});const weak=math.sections.find(s=>s.title==='薄弱学生与针对性安排').rows;assert(weak.some(r=>r[0].includes(a.name('test-4-2'))&&r[3]==='-10.0'));assert(!weak.some(r=>r[0].includes(a.name('test-4-1'))));
});
test('学生报告保留阶段校排名、全部题目、真实0分和未知满分',()=>{
 const a=atlas(),r=buildTeachingReport(a,{kind:'student',sid:'test-4-0',exam:'52'});const stages=r.sections.find(s=>s.title==='阶段成绩变化').rows;assert.equal(stages.length,2);assert.equal(stages[1][3],1);const qs=r.sections.find(s=>s.title==='个人全部小题得分').rows;assert.equal(qs.length,5);assert.equal(qs[0][2],'0.0');assert.equal(qs[0][4],'0.0%');assert.equal(qs[2][4],'—');
});
test('训练选择只计算明确满分，未知和异常题不自动认定薄弱，题目快照独立于后续题库',()=>{
 const a=atlas(),qs=questionOptions(a,{sid:'test-4-0',exam:'52',key:'数学|52'});assert.equal(qs[0].rate,0);assert(qs[0].weak);assert.equal(qs[2].rate,null);assert(!qs[2].weak);const p=draftForPlan(a,{sid:'test-4-0',exam:'52',key:'数学|52'});assert.equal(p.training.questions.length,2);const snapshot=p.training.questions[0];a.data.banks['数学|52'][0].knowledge='新标签';assert.equal(snapshot.knowledge,'函数');
});
test('日期显示星期，周/逾期/未安排筛选正确，非法日期不能伪装成有效安排',()=>{
 assert(validDate('2026-10-19'));assert(!validDate('2026-02-30'));assert(!validDate('2026-13-01'));assert.equal(dateLabel('2026-10-19'),'2026-10-19 · 周一');assert.equal(dateChoices('2026-10-19',2)[1].value,'2026-10-20');assert(planMatchesTime({schedule:{date:'2026-10-18'}},'week','2026-10-13'));assert(!planMatchesTime({schedule:{date:'2026-10-19'}},'week','2026-10-13'));assert(!planMatchesTime({schedule:{date:'2026-10-12'},status:'done'},'overdue','2026-10-13'));assert(planMatchesTime({schedule:{date:'2026-02-30'}},'unscheduled'));
});
test('跟进导出沿用当前班级、状态、日期和知识点筛选，来源考试与题目快照保留',()=>{
 const a=atlas(),p=draftForPlan(a,{sid:'test-4-0',exam:'52',key:'数学|52'});p.id='p1';p.schedule={date:'2026-10-19',slot:'break',period:3,duration:10};const other={...p,id:'p2',status:'done'};const state={planStatus:'new',planClass:4,planSearch:'函数'};assert.equal(selectedPlans([p,other],state,a).length,1);const r=buildTeachingReport(a,{kind:'follow',exam:'all',planState:state},[p,other]);const rows=r.sections.find(s=>s.title==='执行日程与责任分工').rows;assert.equal(rows.length,1);assert.match(rows[0][1],/测试第二场/);assert.match(rows[0][2],/周一.*第3节课后课间/);
});
test('打印长表分组保留全部题号与定位字段，PDF/Word同内容且黑白A4带页码',()=>{
 const a=atlas(),r=buildTeachingReport(a,{kind:'class',no:4,exam:'52',includeRaw:true});const raw=r.sections.find(s=>s.title.startsWith('附录'));raw.headers.push(...Array.from({length:20},(_,i)=>i+4+'题'));raw.rows.forEach(row=>row.push(...Array.from({length:20},(_,i)=>i)));const parts=documentSections(r).filter(s=>s.title.startsWith('附录：数学'));assert(parts.every(s=>s.headers.length<=6));assert(parts.every(s=>s.headers[0]==='学生'&&s.headers[1]==='班级'));for(const header of raw.headers)assert(parts.some(s=>s.headers.includes(header)));const files=wordFiles(r);assert.match(files['word/document.xml'],/w:w="11906" w:h="16838"/);assert.match(files['word/footer1.xml'],/NUMPAGES/);assert(!Object.values(files).join('').includes('C8CDD8'));assert.equal(pdfDefinition(r).pageSize,'A4');
});
test('只有个人小题的学科报告仍保留所有原分，缺成绩单独列出而不列入薄弱名单',()=>{
 const data=makeFixture();data.scores=[];const a=new Atlas(data),r=buildTeachingReport(a,{kind:'subject',no:4,subject:'数学',exam:'52',includeRaw:true});assert.equal(r.sections.find(s=>s.title==='薄弱学生与针对性安排').rows.length,0);assert.equal(r.sections.find(s=>s.title==='需补齐的材料').rows.length,35);assert.equal(r.sections.find(s=>s.title.startsWith('附录：数学')).rows.length,35);
});
test('手动补充训练重点会出现在跟进报告，原题库暂缺时仍保留计划快照',()=>{
 const a=atlas(),p=draftForPlan(a,{sid:'test-4-0',exam:'52',key:'数学|52'});p.training.goal='限定函数定义域后逐步迁移';delete a.data.banks['数学|52'];const next=draftForPlan(a,{},p);assert.equal(next.training.key,'数学|52');assert.equal(next.training.questions[0].score,0);const r=buildTeachingReport(a,{kind:'follow',exam:'all',no:'all'},[next]);assert.match(r.sections.find(s=>s.title==='执行日程与责任分工').rows[0][3],/限定函数定义域/);
});
test('个人原分与明确满分保留小数精度，统计均分仍用便于阅读的格式',()=>{
 const data=makeFixture();data.answers.find(a=>a.sid==='test-4-0'&&a.subject==='数学').values[0]=2.75;data.banks['数学|52'][0].max=5.25;const a=new Atlas(data),r=buildTeachingReport(a,{kind:'student',sid:'test-4-0',exam:'52'});const q=r.sections.find(s=>s.title==='个人全部小题得分').rows[0];assert.equal(q[2],'2.75');assert.equal(q[3],'5.25');
});
test('旧的简单跟进记录只在编辑草稿中补充建议，原记录不凭空产生训练数据',()=>{
 const a=atlas(),old={id:'old',sid:'test-4-0',exam:'52',subject:'数学',status:'new',schedule:{},training:{questions:[],tasks:[]}};const draft=draftForPlan(a,{},old);assert.equal(draft.training.count,5);assert.equal(draft.training.targetRate,80);assert.equal(draft.schedule.duration,10);assert(draft.training.questions.length>0);assert.deepEqual(draft.training.tasks,['same','correction']);assert.equal(old.training.count,undefined);assert.equal(old.training.questions.length,0);
});
