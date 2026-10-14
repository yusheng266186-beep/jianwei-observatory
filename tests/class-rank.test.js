import test from 'node:test';
import assert from 'node:assert/strict';
import {Atlas} from '../app/engine/atlas.js';
import {buildTeachingReport} from '../app/engine/reports.js';
import {normalizeReportScope} from '../app/ui/report-context.js';
import {fillSavedClassRanks} from '../app/engine/report-ranks.js';
import {transferSelection,selectedReport} from '../app/engine/report-selection.js';
import {makeFixture} from './fixtures.cjs';

test('班排名使用原表名次，缺少名次时按同班当次有效总分计算，同分并列',()=>{
 const data=makeFixture(),rows=data.scores.filter(r=>r.classNo===4&&r.exam==='52');
 rows[0].total=500;rows[1].total=500;rows[2].total=490;rows[3].total=null;
 for(const row of rows.slice(4))row.total=480;
 data.scores.find(r=>r.classNo===7&&r.exam==='52').total=700;
 const atlas=new Atlas(data);assert.equal(atlas.classRank(rows[0]),1);assert.equal(atlas.classRank(rows[1]),1);assert.equal(atlas.classRank(rows[2]),3);assert.equal(atlas.classRank(rows[3]),null);
 assert.equal(rows[0].classRank,undefined,'计算名次不写回原表');assert.equal(atlas.gradeRank(rows[0]),rows[0].schoolRank,'不计算或替换校排名');
 rows[2].classRank=9;assert.equal(atlas.classRank(rows[2]),9,'原表名次优先于计算');
 assert.equal(atlas.classRank({...rows[2],sid:'不在此场记录',classRank:null}),null);
 const before=atlas.classRank(rows[4]);rows[0].total=470;atlas.invalidateCaches();assert.equal(atlas.classRank(rows[4]),before-1);
});
test('已保存个人报告只补入能与原成绩匹配的缺失班排名，保留原分、已有排名与教师判断',()=>{
 const atlas=new Atlas(makeFixture()),saved=buildTeachingReport(atlas,{kind:'student',exam:'52',sid:'test-7-0'});saved.created='2026-10-13';saved.note='教师判断保留';
 const overview=saved.sections.find(s=>s.title==='本场学习概况'),history=saved.sections.find(s=>s.title==='阶段成绩变化');overview.rows.find(r=>r[0]==='班级排名')[1]='—';history.rows[0][4]='—';history.rows[1][4]=19;
 const filled=fillSavedClassRanks(saved,atlas);assert.equal(filled.sections.find(s=>s.title==='本场学习概况').rows.find(r=>r[0]==='班级排名')[1],'第3名');assert.deepEqual(filled.sections.find(s=>s.title==='阶段成绩变化').rows.map(r=>r[4]),[3,19]);assert.equal(filled.created,saved.created);assert.equal(filled.note,saved.note);assert.equal(overview.rows.find(r=>r[0]==='班级排名')[1],'—');
 overview.rows.find(r=>r[0]==='本场总分')[1]=900;assert.equal(fillSavedClassRanks(saved,atlas).sections.find(s=>s.title==='本场学习概况').rows.find(r=>r[0]==='班级排名')[1],'—','成绩不匹配时不补写');
});
test('个人与班级报告使用一致班排名，转班历史按当次班级计算且类型切换带入实际班级',()=>{
 const data=makeFixture(),atlas=new Atlas(data),student=buildTeachingReport(atlas,{kind:'student',exam:'52',sid:'test-7-0',no:4});
 assert.equal(student.spec.no,7);assert.equal(student.sections.find(s=>s.title==='本场学习概况').rows.find(r=>r[0]==='班级排名')[1],'第3名');
 const history=student.sections.find(s=>s.title==='阶段成绩变化');assert(history.rows.every(r=>r[4]===3));
 const scope=normalizeReportScope(atlas,student.spec,{kind:'class'});assert.equal(scope.no,7);const report=buildTeachingReport(atlas,scope),roster=report.sections.find(s=>s.title==='班级学生成绩与短板'),row=roster.rows.find(r=>r[0]===atlas.name('test-7-0'));
 assert.equal(row[roster.headers.indexOf('班级排名')],3);assert.equal(report.spec.kind,'class');
 student.outputSelection={title:'某学生自定义标题',order:[...student.sections.keys()].reverse()};report.outputSelection=transferSelection(student,report);const output=selectedReport(report);assert.equal(output.sections[0].title,'班级概况');assert.equal(output.title,report.title);
 const subjectScope=normalizeReportScope(atlas,student.spec,{kind:'subject',subject:'数学'});assert.equal(subjectScope.no,7);assert.equal(buildTeachingReport(atlas,subjectScope).kind,'subject');
});
