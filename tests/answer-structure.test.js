import test from 'node:test';
import assert from 'node:assert/strict';
import {answerStructure} from '../app/engine/answer-structure.js';
import {questionLens} from '../app/engine/lenses.js';
import {questionEvidence} from '../app/ui/question.js';
import {answerRows} from '../app/io/exports.js';
import {Atlas} from '../app/engine/atlas.js';
import {makeFixture} from './fixtures.cjs';

test('得分结构边界互斥且覆盖全部作答，0、负分、超满分和空白均保留',()=>{
  const answers=[0,null,-1,2.99,3,7.99,8,9.99,10,12].map(v=>({values:[v]})),s=answerStructure(answers,{index:0,max:10},{lowRate:.3,focusRate:.8});
  assert.deepEqual(s.groups.map(g=>g.count),[1,2,2,2,2,1]);
  for(const a of answers)assert.equal(s.groups.filter(g=>g.test(a)).length,1);
  assert.ok(Math.abs(s.groups.reduce((sum,g)=>sum+g.share,0)-1)<1e-12);assert.equal(s.min,-1);assert.equal(s.max,12);assert.equal(s.filled,9);
});
test('未知满分不制造分段，空范围没有虚构比例，极端研究口径仍不丢作答',()=>{
  const answers=[0,4,null,-2].map(v=>({values:[v]})),s=answerStructure(answers,{index:0,max:null});
  assert.deepEqual(s.groups.map(g=>[g.id,g.count]),[['zero',1],['scored',2],['missing',1]]);
  assert.equal(s.knownMax,false);assert.equal(s.groups.some(g=>['low','focus','secure','full'].includes(g.id)),false);
  const blank=answerStructure([],{index:0,max:10});assert.equal(blank.min,null);assert.ok(blank.groups.every(g=>g.share===null));
  for(const lowRate of [0,1]){const q=answerStructure(answers,{index:0,max:5},{lowRate,focusRate:0});assert.equal(q.groups.reduce((n,g)=>n+g.count,0),4);}
});
test('小数分数恰在研究阈值上时不被浮点除法分进前一段，原分保持不变',()=>{
  const answers=[3.3,6.6].map(v=>({values:[v]})),s=answerStructure(answers,{index:0,max:10},{lowRate:.33,focusRate:.66});
  assert.deepEqual(s.groups.map(g=>g.count),[0,0,1,1,0,0]);assert.deepEqual(answers.map(a=>a.values[0]),[3.3,6.6]);
});
test('结构点击使用同一分段规则筛名单，姓名检索不改写整题结构，导出同时保留两种范围',()=>{
  const atlas=new Atlas(makeFixture()),state={key:'数学|52',classes:[4],question:0,filter:'low',search:'校检4班03',sort:'high'};
  const model=questionLens(atlas,state);assert.deepEqual(model.matches.map(a=>a.sid),['test-4-2']);assert.equal(model.structure.total,35);
  const report=questionEvidence(atlas,state);assert.equal(report.sheets['本题作答'].length,2);assert.equal(report.sheets['本题得分结构'].slice(1).reduce((n,row)=>n+row[2],0),35);
  assert.ok(report.sheets['观察范围'].some(row=>row[0]==='名单排序'&&row[1]==='高分在前'));
  const unknown=questionLens(atlas,{...state,question:2,search:''});assert.equal(unknown.selectedId,'all');assert.ok(questionLens(atlas,{...state,question:2,filter:'scored',search:''}).matches.every(a=>a.values[2]!==0&&a.values[2]!==null));
});
test('单卷导出沿用原始子题号，空卷保留全部题列，混合试卷保持既有位置列',()=>{
  const data=makeFixture();data.banks['数学|52'].forEach((q,i)=>q.label=['1(1)','1(2)','12'][i]);const atlas=new Atlas(data),answers=atlas.paper('数学|52',[4]).answers;
  const rows=answerRows(atlas,answers);assert.deepEqual(rows[0].slice(4),['第1(1)题','第1(2)题','第12题']);assert.deepEqual(rows[1].slice(4),[0,0,null]);
  assert.deepEqual(answerRows(atlas,[],'数学|52')[0],rows[0]);assert.deepEqual(answerRows(atlas,data.answers)[0].slice(4),['第1题','第2题','第3题']);
});
