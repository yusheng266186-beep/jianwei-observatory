import test from 'node:test';
import assert from 'node:assert/strict';
import {Atlas} from '../app/engine/atlas.js';
import {reportClasses,reportExams,reportSubjects} from '../app/engine/report-scope.js';
import {buildTeachingReport} from '../app/engine/reports.js';
import {reportSpec,reportStudio} from '../app/ui/report-studio.js';
import {normalizeReportScope,reportContext} from '../app/ui/report-context.js';
import {makeFixture} from './fixtures.cjs';
function sparse(){const data=makeFixture();data.scores=data.scores.filter(row=>row.classNo===4&&row.exam==='51'||row.classNo===7&&row.exam==='52');data.answers=data.answers.filter(row=>row.classNo===7);return data;}
test('报告考试与班级跟随实际材料联动，历史班级不被带入没有记录的新考次',()=>{
 const atlas=new Atlas(sparse()),previous={kind:'class',exam:'51',no:4},next=normalizeReportScope(atlas,previous,{exam:'52'});
 assert.deepEqual(reportClasses(atlas,previous),[4]);assert.deepEqual(reportClasses(atlas,next),[7]);assert.equal(next.no,7);assert.match(buildTeachingReport(atlas,next).subtitle,/7班.*测试第二场/);
 const report=buildTeachingReport(atlas,next),context=reportContext(atlas,report,{});assert.match(context,/data-key="no" data-value="7"/);assert.doesNotMatch(context,/data-key="no" data-value="4"/);
 assert.equal(normalizeReportScope(atlas,next,{exam:'51'}).no,4);
});
test('学科和学生仅显示本场对应材料，外语保留原语种小题，失效的班级筛选正常回到全部',()=>{
 const data=sparse();data.scores[0].subjects={语文:{score:80}};for(const row of data.scores.filter(row=>row.classNo===7))delete row.subjects['语文'];const atlas=new Atlas(data);
 assert.deepEqual(reportClasses(atlas,{kind:'subject',exam:'52',subject:'语文'}),[]);assert.deepEqual(reportClasses(atlas,{kind:'subject',exam:'52',subject:'数学'}),[7]);assert(reportSubjects(atlas,'52').includes('外语'));
 const student=reportSpec(atlas,{reportKind:'student',reportExam:'52',reportStudentClass:4,reportSid:'test-4-0'});assert.equal(student.sid,'test-7-0');assert.match(buildTeachingReport(atlas,student).subtitle,/7班/);
 const subject=reportSpec(atlas,{reportKind:'subject',reportExam:'52',reportSubject:'数学',reportSubjectClass:4});assert.equal(subject.no,'all');
 for(const language of ['英语','日语']){const foreign=reportSpec(atlas,{reportKind:'subject',reportExam:'52',reportSubject:language});assert.equal(foreign.subject,'外语');assert.match(buildTeachingReport(atlas,foreign).title,/外语/);assert(buildTeachingReport(atlas,foreign).sections.find(section=>section.title==='全卷题目与知识点').rows.some(row=>row[0].startsWith('日语')));}
});
test('只有小题的材料可以生成学科和学生报告，班级报告入口明确要求成绩表',()=>{
 const data=sparse();data.scores=[];const atlas=new Atlas(data);assert.deepEqual(reportExams(atlas,'class'),[]);assert.deepEqual(reportExams(atlas,'subject').map(exam=>exam.id),['52']);
 const spec=reportSpec(atlas);assert.equal(spec.kind,'subject');assert.doesNotThrow(()=>buildTeachingReport(atlas,spec));
 const classView=reportStudio(atlas,{reportKind:'class'},{plans:[]});assert.match(classView,/data-cmd="teaching-report-build" disabled/);assert.match(classView,/已有小题材料可生成学科或学生报告/);
 assert.doesNotThrow(()=>buildTeachingReport(atlas,reportSpec(atlas,{reportKind:'student',reportExam:'51'})));
});
