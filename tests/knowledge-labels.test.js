import test from 'node:test';
import assert from 'node:assert/strict';
import {Atlas} from '../app/engine/atlas.js';
import {buildTeachingReport} from '../app/engine/reports.js';
import {knowledgeLabels,repairKnowledgeReport} from '../app/engine/knowledge.js';
import {makeFixture} from './fixtures.cjs';
test('知识点重复标注只计入同题一次，缺失标记不是教学知识点',()=>{
 assert.deepEqual(knowledgeLabels('函数；函数，导数；—；未标注；知识点未标注'),['函数','导数']);
 const data=makeFixture();data.banks['数学|52'][0].knowledge='函数；函数，—';const lens=new Atlas(data).paper('数学|52');
 const skill=lens.skills.find(s=>s.name==='函数');assert.deepEqual(skill.questions.map(q=>q.label),['1','2']);assert.equal(skill.loss,skill.questions.reduce((sum,q)=>sum+(q.loss??0),0));
 const missing=lens.skills.find(s=>s.name==='未标注');assert.equal(missing.labelled,false);assert.equal(missing.advice,'按题号分析');assert.equal(lens.questions.length,3);
});
test('缺少知识点时报告按原题安排训练，不把破折号或未标注写成训练方向',()=>{
 const data=makeFixture();for(const q of data.banks['数学|52'])q.knowledge='未标注';const atlas=new Atlas(data);
 const subject=buildTeachingReport(atlas,{kind:'subject',exam:'52',no:4,subject:'数学'});
 const advice=subject.sections.find(s=>s.title==='学科概况').rows.find(r=>r[0]==='教学建议')[1];assert(!/围绕.*(?:—|未标注)/.test(advice));
 assert.equal(subject.sections.find(s=>s.title==='知识点训练优先级').rows.length,0);const arrangements=subject.sections.find(s=>s.title==='薄弱学生与针对性安排').rows;assert(arrangements.length);assert(arrangements.every(row=>!row[5].includes('按知识点分组')));assert.equal(subject.sections.find(s=>s.title==='全卷题目与知识点').rows.length,3);
 const student=buildTeachingReport(atlas,{kind:'student',exam:'52',sid:'test-4-0'});const direction=student.sections.find(s=>s.title==='学科短板与改进方向').rows.find(r=>r[0]==='数学')[5];
 assert.match(direction,/第1题/);assert(!/围绕.*未标注/.test(direction));
});
test('已保存报告只修正自动建议和缺标签分组，分数、日期与教师判断不重算',()=>{
 const original={id:'saved',kind:'subject',spec:{subject:'数学'},created:'2026-10-13',note:'围绕未标注材料记录教师判断',sections:[
  {title:'学科概况',headers:['项目','结果'],rows:[['总分',450],['教学建议','优先跟进2名学生；围绕—组织分层训练。']]},
  {title:'知识点训练优先级',headers:['试卷','知识点','得分率'],rows:[['数学','未标注','40%'],['数学','函数','60%']]},
  {title:'教师记录与复核',headers:['学生','教学记录'],rows:[['匿名','围绕未标注材料记录教师判断']]}
 ]};
 const fixed=repairKnowledgeReport(original);assert.equal(fixed.sections[0].rows[0][1],450);assert.equal(fixed.id,original.id);assert.equal(fixed.note,original.note);assert.equal(fixed.created,original.created);assert.deepEqual(fixed.sections[2],original.sections[2]);
 assert(!fixed.sections[0].rows[1][1].includes('围绕—'));assert.equal(fixed.sections[1].rows.length,1);assert.equal(original.sections[1].rows.length,2);assert.equal(repairKnowledgeReport(fixed),fixed);
});
