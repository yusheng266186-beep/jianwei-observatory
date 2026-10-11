import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeDatasets,parseFlat} from '../app/data/parser.js';
import {Atlas} from '../app/engine/atlas.js';
import {render as board} from '../app/scenes/board.js';
import fixtures from './fixtures.cjs';
const {makeFixture}=fixtures;

test('合并部分成绩保留已有总分、其他学科与未变成绩排名',()=>{
  const current=makeFixture(),original=current.scores.find(r=>r.sid==='test-4-0'&&r.exam==='52');
  const incoming=parseFlat([['姓名','班级','考试','数学成绩'],[current.students[0].name,4,'52',original.subjects['数学'].score]],'匿名补充分数');
  const merged=mergeDatasets(current,incoming),row=merged.scores.find(r=>r.sid===original.sid&&r.exam==='52');
  assert.equal(row.total,original.total);assert.equal(row.rawTotal,original.rawTotal);
  assert.deepEqual(row.subjects['语文'],original.subjects['语文']);
  assert.equal(row.subjects['数学'].score,original.subjects['数学'].score);
  assert.equal(row.subjects['数学'].rank,original.subjects['数学'].rank);
  assert.equal(row.subjects['数学'].schoolRank,original.subjects['数学'].schoolRank);
  assert.equal(current.scores.find(r=>r.sid===original.sid&&r.exam==='52').total,original.total);
});
test('补充小题按题号联结，换序和新增题目不改错旧作答',()=>{
  const current=makeFixture(),incoming=makeFixture();
  incoming.scores=[];incoming.answers=incoming.answers.filter(a=>a.classNo===7&&a.subject==='数学');
  incoming.banks={'数学|52':[{label:'2',max:10,knowledge:'函数'},{label:'1',max:5,knowledge:'函数'},{label:'4',max:8,knowledge:'新知识点'}]};
  for(const a of incoming.answers)a.values=[7,3,6];
  const original=current.answers.find(a=>a.sid==='test-4-2'&&a.subject==='数学');
  const atlas=new Atlas(mergeDatasets(current,incoming)),old=atlas.questionsFor(atlas.materialAt('test-4-2','52'),'数学'),fresh=atlas.questionsFor(atlas.materialAt('test-7-0','52'),'数学');
  for(const [index,q] of current.banks['数学|52'].entries())assert.equal(old.find(p=>p.label===q.label).score,original.values[index]);
  assert.equal(old.find(q=>q.label==='4').score,null);
  assert.equal(fresh.find(q=>q.label==='1').score,3);assert.equal(fresh.find(q=>q.label==='2').score,7);
  assert.equal(fresh.find(q=>q.label==='4').score,6);assert.equal(fresh.find(q=>q.label==='3').score,null);
});
test('同一份作答的空白补充分数保留旧值，0可以覆盖',()=>{
  const current=makeFixture(),incoming=makeFixture();incoming.answers=incoming.answers.filter(a=>a.sid==='test-4-3'&&a.subject==='数学');
  incoming.answers[0].values=[null,0,null];const old=current.answers.find(a=>a.sid==='test-4-3'&&a.subject==='数学');
  const row=mergeDatasets(current,incoming).answers.find(a=>a.sid==='test-4-3'&&a.subject==='数学');
  assert.equal(row.values[0],old.values[0]);assert.equal(row.values[1],0);assert.equal(row.values[2],old.values[2]);
});
test('成绩被实际0修改时旧排名失效，明确的新排名可保留',()=>{
  const current=makeFixture(),original=current.scores.find(r=>r.sid==='test-4-3'&&r.exam==='52');
  original.cityRank=9;original.schoolRank=3;
  const incoming=parseFlat([['姓名','班级','考试','数学成绩','总分'],[current.students[3].name,4,'52',0,0]],'匿名零分更新');
  const row=mergeDatasets(current,incoming).scores.find(r=>r.sid===original.sid&&r.exam==='52');
  assert.equal(row.total,0);assert.equal(row.subjects['数学'].score,0);assert.equal(row.cityRank,null);assert.equal(row.schoolRank,null);assert.equal(row.subjects['数学'].rank,null);
  incoming.scores[0].schoolRank=100;incoming.scores[0].subjects['数学'].rank=200;
  const ranked=mergeDatasets(current,incoming).scores.find(r=>r.sid===original.sid&&r.exam==='52');
  assert.equal(ranked.schoolRank,100);assert.equal(ranked.subjects['数学'].rank,200);
});
test('重复题号导致换序无法唯一匹配时拒绝合并，原资料保持完整',()=>{
  const current=makeFixture(),incoming=makeFixture();current.banks['数学|52'][1].label='1';
  incoming.banks['数学|52'].reverse();
  assert.throws(()=>mergeDatasets(current,incoming),/重复题号/);
  assert.equal(current.banks['数学|52'][0].label,'1');
});
test('不同姓名内部ID相撞时保留两个档案并正确联结新成绩',()=>{
  const current=makeFixture(),incoming=makeFixture();incoming.students=[{id:'test-4-0',name:'新来的匿名学生'}];
  incoming.scores=incoming.scores.filter(r=>r.sid==='test-4-0');incoming.answers=[];incoming.banks={};
  const atlas=new Atlas(mergeDatasets(current,incoming)),person=atlas.data.students.find(p=>p.name==='新来的匿名学生');
  assert.notEqual(person.id,'test-4-0');assert.equal(atlas.name('test-4-0'),current.students[0].name);
  assert.equal(atlas.story(person.id).length,2);assert.equal(atlas.story('test-4-0').length,2);
});
test('查看早期考试的有效账不默认与自己比较',()=>{
  const atlas=new Atlas(makeFixture()),report=board(atlas,{mode:'targets',exam:'51'},{}).report;
  const row=report.sheets['班级有效人'].find(r=>r[0]===4);
  assert.equal(row[6],null);assert.equal(row[8],null);assert.equal(row[11],null);
});
test('导入列中的明确科类用于分组，英文标识及考试后缀也可识别',()=>{
  for(const [exam,track] of [['53','历史类'],['53','history'],['53历','']]){
    const atlas=new Atlas(parseFlat([['姓名','班级','考试','类别','总分'],['匿名历史学生',4,exam,track,400]],'匿名科类表'));
    assert.equal(atlas.rows('53')[0].track,'history');assert.equal(atlas.profile(4).track,'history');
    assert.equal(atlas.groups('53').find(g=>g.key==='history').rows.length,1);
    assert.equal(atlas.groups('53').find(g=>g.key==='physics').rows.length,0);
  }
});
