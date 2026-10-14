import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Atlas} from '../app/engine/atlas.js';
import {buildTeachingReport} from '../app/engine/reports.js';
import {presetSections,selectedReport,teachingFields} from '../app/engine/report-selection.js';
import {normalizePlan,validatePlanReview,reviewMetrics,reviewSummary,planMatchesTime} from '../app/engine/training.js';
import {pendingReportBrief} from '../app/ui/report-brief.js';
const {makeFixture}=createRequire(import.meta.url)('./fixtures.cjs');
test('教学摘要保留班级全员排名，所有原题与历史仍可加入完整报告',()=>{
 const atlas=new Atlas(makeFixture()),report=buildTeachingReport(atlas,{kind:'class',no:4,exam:'52',includeRaw:true}),summary=selectedReport({...report,outputSelection:{selected:presetSections(report,'teaching'),fields:teachingFields(report)}});
 assert(summary.sections.some(s=>s.title==='班级学生成绩与短板'&&s.rows.length===atlas.classAt(4,'52').length));assert(summary.sections.some(s=>s.title==='优先教学题目'));assert.equal(summary.sections.find(s=>s.title==='班级学生成绩与短板').headers.length,6);
 assert(!summary.sections.some(s=>s.title.startsWith('附录：')));const all=selectedReport({...report,outputSelection:{selected:presetSections(report,'all')}});assert(all.sections.some(s=>s.title.startsWith('附录：')));assert(all.sections.some(s=>s.title==='班级阶段对照'));
});
test('学科摘要的优先名单和题目明确限定，完整名单独立保留',()=>{
 const data=makeFixture(),atlas=new Atlas(data),report=buildTeachingReport(atlas,{kind:'subject',subject:'数学',no:'all',exam:'52'}),full=report.sections.find(s=>s.title==='薄弱学生与针对性安排'),short=report.sections.find(s=>s.title==='优先跟进学生');
 assert.equal(short.rows.length,Math.min(12,full.rows.length));assert.match(short.caption,/前12人/);assert.deepEqual(short.rows,full.rows.slice(0,12));assert.equal(data.scores.length,atlas.data.scores.length);
 const selected=presetSections(report,'teaching');assert(selected.includes(report.sections.indexOf(short)));assert(!selected.includes(report.sections.indexOf(full)));
});
test('只有小题时教学摘要仍包含全部可用题目证据',()=>{
 const data=makeFixture();data.scores=[];const atlas=new Atlas(data),subject=buildTeachingReport(atlas,{kind:'subject',subject:'数学',no:'all',exam:'52'}),person=buildTeachingReport(atlas,{kind:'student',sid:'test-4-0',exam:'52'});
 assert(subject.questionOnly);assert(presetSections(subject,'teaching').includes(subject.sections.findIndex(s=>s.title==='全卷题目与知识点')));assert(person.questionOnly);assert(presetSections(person,'teaching').includes(person.sections.findIndex(s=>s.title==='个人全部小题得分')));
});
test('复核实测零分有效，目标与实测独立，日期及题数边界得到验证',()=>{
 const plan=normalizePlan({training:{targetRate:80,questions:[{label:'1',score:5,max:10}]},reviewDate:'2026-10-14',review:{correct:'0',total:'5'}}),snapshot=structuredClone(plan.training.questions);validatePlanReview(plan);assert.equal(reviewMetrics(plan).rate,0);assert.equal(reviewSummary(plan),'实测 0 / 5题 · 正确率 0%');assert.equal(plan.training.targetRate,80);assert.deepEqual(plan.training.questions,snapshot);
 assert.throws(()=>validatePlanReview({...plan,review:{correct:6,total:5}}),/总题数/);assert.throws(()=>validatePlanReview({...plan,review:{correct:2,total:''}}),/总题数/);assert.throws(()=>validatePlanReview({...plan,reviewDate:''}),/日期/);validatePlanReview(normalizePlan({}));
 assert.equal(planMatchesTime({...plan,status:'active',schedule:{date:'2026-10-01'},reviewDate:'2026-10-20'},'overdue','2026-10-14'),false);
});
test('实测在报告中回看，冷启动速览来自所选对象并转义教师文本',()=>{
 const atlas=new Atlas(makeFixture()),person=atlas.data.scores.find(r=>r.exam==='52'&&r.classNo===4),plan={sid:person.sid,classNo:4,exam:'52',reviewDate:'2026-10-14',review:{correct:3,total:5},result:'<完成订正>',training:{questions:[],tasks:[]}},report=buildTeachingReport(atlas,{kind:'student',sid:person.sid,exam:'52'},[plan]);
 const actual=report.sections.find(s=>s.title==='教师记录与复核');assert(actual.rows[0].includes('实测 3 / 5题 · 正确率 60%'));assert(actual.rows[0].includes('<完成订正>'));
 const brief=pendingReportBrief({...report,title:'<学习报告>'});assert(brief.includes('本场学习概况'));assert(brief.includes('班级排名'));assert(brief.includes('&lt;学习报告&gt;'));assert(!brief.includes('<学习报告>'));
});
