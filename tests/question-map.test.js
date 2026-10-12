import test from 'node:test';
import assert from 'node:assert/strict';
import {Atlas} from '../app/engine/atlas.js';
import {queryQuestionMap,questionSequence} from '../app/engine/question-map.js';
import {render} from '../app/scenes/papers.js';
import {makeFixture} from './fixtures.cjs';

test('逐题地图按本卷、本班样本区分低分、空缺与未知满分',()=>{
  const data=makeFixture();data.answers=data.answers.filter(a=>a.subject!=='数学'||a.sid==='test-4-0');
  const lens=new Atlas(data).paper('数学|52',[4]);
  assert.deepEqual(queryQuestionMap(lens,{questionFocus:'low'}).matches.map(q=>q.index),[0,1]);
  assert.deepEqual(queryQuestionMap(lens,{questionFocus:'missing'}).matches.map(q=>q.index),[2]);
  assert.deepEqual(queryQuestionMap(lens,{questionFocus:'max'}).matches.map(q=>q.index),[2]);
  assert.equal(lens.questions[0].rate,0);
  const noAnswers=new Atlas(data).paper('数学|52',[7]);
  assert.equal(queryQuestionMap(noAnswers,{questionFocus:'missing'}).matches.length,0);
  assert.equal(queryQuestionMap(noAnswers,{questionFocus:'low'}).matches.length,0);
});
test('检索支持题号、知识点、全角输入，计数随检索变化，低分口径采用已有规则',()=>{
  const lens=new Atlas(makeFixture()).paper('数学|52',[4]);
  assert.deepEqual(queryQuestionMap(lens,{questionSearch:'第１题 函数'}).matches.map(q=>q.index),[0]);
  assert.deepEqual(queryQuestionMap(lens,{questionSearch:'函数',questionFocus:'max'}).filters.map(f=>f.count),[2,2,2,0]);
  assert.equal(queryQuestionMap(lens,{questionFocus:'low'},{lowRate:0}).matches.length,0);
  assert.equal(queryQuestionMap(lens,{questionFocus:'low'},{lowRate:1}).matches.length,2);
  assert.equal(queryQuestionMap(lens,{questionSearch:'不存在'}).matches.length,0);
  assert.equal(queryQuestionMap(lens,{questionFocus:'old-value'}).selected,'all');
});
test('失分排序把未知值放最后，保存的地图题序去重并容忍资料变化',()=>{
  const lens={answers:[{}],questions:[{index:0,label:'1',count:1,loss:null},{index:1,label:'2',count:1,loss:0},{index:2,label:'3',count:1,loss:6},{index:3,label:'4',count:1,loss:6}]};
  assert.deepEqual(queryQuestionMap(lens,{order:'loss'}).matches.map(q=>q.index),[2,3,1,0]);
  assert.deepEqual(questionSequence(lens,{question:2,queue:[2,2,99,'1',1]}).questions.map(q=>q.index),[2,1]);
  assert.equal(questionSequence(lens,{question:0,queue:[2,1]}).fromMap,false);
  assert.deepEqual(lens.questions.map(q=>q.index),[0,1,2,3]);
});
test('筛选地图导出同时保留观察条件、匹配题目与完整原始证据',()=>{
  const atlas=new Atlas(makeFixture()),view=render(atlas,{key:'数学|52',tab:'map',classes:[4],questionSearch:'函数',questionFocus:'all',order:'loss'});
  assert.equal(view.report.sheets['当前题目地图'].length,3);
  assert.equal(view.report.sheets['逐题诊断'].length,4);
  assert.equal(view.report.sheets['个人学科小题得分'].length,36);
  assert.ok(view.report.sheets['观察条件'].some(row=>row[0]==='题目检索'&&row[1]==='函数'));
  assert.ok(view.report.sections.some(section=>section.title==='当前题目地图'&&section.rows.length===2));
});
