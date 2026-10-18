import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFlat,mergeDatasets} from '../app/data/parser.js';
import {Atlas} from '../app/engine/atlas.js';

const flat=(headers,rows,file='匿名.csv')=>parseFlat([headers,...rows],file);

test('D03 合并保护教师考次名称/顺序/范围，已有有效线不被incoming空白抹掉',()=>{
 const current=flat(['姓名','班级','考试','总分'],[['匿名甲',4,'52',450]],'当前.csv');
 Object.assign(current.exams[0],{label:'教师自定义考次',order:77,scope:'city'});
 current.lines=[{exam:'52',track:'physics',top:550,under:430,subjects:{数学:{top:88,under:68},外语:{top:90,under:70}}}];
 const incoming=flat(['姓名','班级','考试','总分'],[['匿名甲',4,'52',460]],'补充.csv');
 incoming.lines=[{exam:'52',track:'physics',top:null,under:null,subjects:{数学:{top:null,under:null}}}];
 const merged=mergeDatasets(current,incoming);
 assert.equal(merged.exams[0].label,'教师自定义考次');assert.equal(merged.exams[0].order,77);assert.equal(merged.exams[0].scope,'city');
 const line=merged.lines.find(item=>item.exam==='52'&&item.track==='physics');
 assert.deepEqual([line.top,line.under],[550,430]);assert.deepEqual(line.subjects['数学'],{top:88,under:68});assert.deepEqual(line.subjects['外语'],{top:90,under:70});
 incoming.lines[0].top=560;incoming.lines[0].subjects['数学']={top:92,under:null};
 const updated=mergeDatasets(current,incoming),next=updated.lines.find(item=>item.exam==='52'&&item.track==='physics');
 assert.deepEqual([next.top,next.under],[560,430]);assert.deepEqual(next.subjects['数学'],{top:92,under:68});
 assert.equal(updated.exams[0].label,'教师自定义考次');
});

test('D03 仅默认考次字段允许被补充表真正更新，新考次与新课次线保留',()=>{
 const current=flat(['姓名','班级','考试','总分'],[['匿名甲',4,'52',450]],'当前.csv');
 const incoming=flat(['姓名','班级','考试','总分'],[['匿名甲',4,'52',450],['匿名乙',4,'53',400]],'补充.csv');
 Object.assign(incoming.exams.find(exam=>exam.id==='52'),{label:'补充表自定义',order:88,scope:'city'});
 const newExam=incoming.exams.find(exam=>exam.id==='53');Object.assign(newExam,{label:'补充新考次',order:99,scope:'school'});
 incoming.lines.push({exam:'53',track:'physics',top:null,under:400,subjects:{数学:{top:null,under:60}}});
 const merged=mergeDatasets(current,incoming);
 assert.equal(merged.exams.find(exam=>exam.id==='52').label,'补充表自定义');
 assert.equal(merged.exams.find(exam=>exam.id==='53').label,'补充新考次');
 const line=merged.lines.find(item=>item.exam==='53'&&item.track==='physics');
 assert.deepEqual([line.top,line.under,line.subjects['数学'].under],[null,400,60]);
 const protectedExam=flat(['姓名','班级','考试','总分'],[['匿名甲',4,'52',450]],'当前.csv');
 protectedExam.exams[0].manuallyConfigured=true;
 const kept=mergeDatasets(protectedExam,incoming);
 assert.equal(kept.exams.find(exam=>exam.id==='52').label,'高三第二次月考');
});

test('D06 原始总分改变清空原分与未标来源排名，不重算、不误伤其他学生',()=>{
 const current=flat(['姓名','班级','考试','总分','原始总分','原分市排名','原分班级排名','原分校排名'],[
  ['匿名甲',4,'52',450,420,300,2,18],
  ['匿名乙',4,'52',430,400,420,5,30]
 ],'当前.csv');
 const incoming=flat(['姓名','班级','考试','总分','原始总分'],[['匿名甲',4,'52',450,425]],'补充.csv');
 const merged=mergeDatasets(current,incoming),first=merged.scores.find(row=>row.rawTotal===425),second=merged.scores.find(row=>row.rawTotal===400);
 assert.deepEqual([first.cityRank,first.classRank,first.schoolRank],[null,null,null]);
 assert.ok(!('cityRank' in first.rankSources));assert.ok(!('classRank' in first.rankSources));assert.ok(!('schoolRank' in first.rankSources));
 assert.deepEqual([second.cityRank,second.classRank,second.schoolRank],[420,5,30]);
});

test('D06 只改赋分总分清空赋分/未标范围排名，保留原分来源排名',()=>{
 const assigned=flat(['姓名','班级','考试','总分','原始总分','赋分校排名'],[['匿名甲',4,'52',450,420,10]],'当前.csv');
 const assignedUpdate=flat(['姓名','班级','考试','总分','原始总分'],[['匿名甲',4,'52',460,420]],'补充.csv');
 assert.equal(mergeDatasets(assigned,assignedUpdate).scores[0].schoolRank,null);
 const rawOnly=flat(['姓名','班级','考试','总分','原始总分','赋分校排名'],[['匿名甲',4,'52',450,420,10]],'当前.csv');
 const rawUpdate=flat(['姓名','班级','考试','总分','原始总分'],[['匿名甲',4,'52',450,425]],'补充.csv');
 assert.equal(mergeDatasets(rawOnly,rawUpdate).scores[0].schoolRank,10);
 const legacy=flat(['姓名','班级','考试','总分','原始总分','校赋名'],[['匿名甲',4,'52',450,420,10]],'当前.csv');
 const legacyUpdate=flat(['姓名','班级','考试','总分','原始总分'],[['匿名甲',4,'52',460,420]],'补充.csv');
 assert.equal(mergeDatasets(legacy,legacyUpdate).scores[0].schoolRank,null);
 const unknown=flat(['姓名','班级','考试','总分','原始总分','校排名'],[['匿名甲',4,'52',450,420,10]],'当前.csv');
 assert.equal(mergeDatasets(unknown,rawUpdate).scores[0].schoolRank,null);
});

test('D06 新表明确提供的排名不被原分变化误伤',()=>{
 const current=flat(['姓名','班级','考试','总分','原始总分','原分校排名'],[['匿名甲',4,'52',450,420,18]],'当前.csv');
 const incoming=flat(['姓名','班级','考试','总分','原始总分','原分校排名'],[['匿名甲',4,'52',450,425,20]],'补充.csv');
 const merged=mergeDatasets(current,incoming);
 assert.equal(merged.scores[0].rawTotal,425);assert.equal(merged.scores[0].schoolRank,20);assert.equal(merged.scores[0].rankSources.schoolRank,'原分校排名');
});

test('D06 学科原分改变只清对应来源学科排名，赋分排名与新表排名保留',()=>{
 const current=flat(['姓名','班级','考试','总分','原始总分','数学','数学原分'],[['匿名甲',4,'52',450,420,80,60]],'当前.csv');
 const math=current.scores[0].subjects['数学'];
 Object.assign(math,{schoolRank:12,rankSources:{schoolRank:'数学原分校排名'},rankProvenance:'column-headings-v2'});
 const rawUpdate=flat(['姓名','班级','考试','数学','数学原分'],[['匿名甲',4,'52',80,65]],'补充.csv');
 const merged=mergeDatasets(current,rawUpdate).scores[0].subjects['数学'];
 assert.equal(merged.raw,65);assert.equal(merged.score,80);assert.equal(merged.schoolRank,null);assert.ok(!('schoolRank' in merged.rankSources));
 const assignedRank=flat(['姓名','班级','考试','总分','原始总分','数学','数学原分'],[['匿名甲',4,'52',450,420,80,60]],'当前.csv');
 Object.assign(assignedRank.scores[0].subjects['数学'],{schoolRank:12,rankSources:{schoolRank:'数学赋分校排名'},rankProvenance:'column-headings-v2'});
 const rawOnly=flat(['姓名','班级','考试','数学','数学原分'],[['匿名甲',4,'52',80,65]],'补充.csv');
 assert.equal(mergeDatasets(assignedRank,rawOnly).scores[0].subjects['数学'].schoolRank,12);
 const unknown=flat(['姓名','班级','考试','总分','原始总分','数学','数学原分'],[['匿名甲',4,'52',450,420,80,60]],'当前.csv');
 Object.assign(unknown.scores[0].subjects['数学'],{schoolRank:120,rankSources:{},rankProvenance:'column-headings-v2'});
 const assigned=flat(['姓名','班级','考试','数学','数学原分'],[['匿名甲',4,'52',82,60]],'补充.csv');
 assert.equal(mergeDatasets(unknown,assigned).scores[0].subjects['数学'].schoolRank,null);
 const explicit=flat(['姓名','班级','考试','数学','数学原分'],[['匿名甲',4,'52',80,65]],'补充.csv');
 Object.assign(explicit.scores[0].subjects['数学'],{schoolRank:88,rankSources:{schoolRank:'数学原分校排名'},rankProvenance:'column-headings-v2'});
 assert.equal(mergeDatasets(current,explicit).scores[0].subjects['数学'].schoolRank,88);
});

test('D07 市级学科排名优先cityRank并回退legacy rank，校内口径不退化',()=>{
 const rankRow=(scope,fields)=>{
  const data=flat(['姓名','班级','考试','数学'],[['匿名甲',4,'52',80]],'匿名.csv');
  data.exams[0].scope=scope;Object.assign(data.scores[0].subjects['数学'],fields);
  return new Atlas(data).subjectRank(data.scores[0],'数学');
 };
 assert.equal(rankRow('city',{cityRank:18,schoolRank:5,rank:null}),18);
 assert.equal(rankRow('city',{cityRank:null,rank:22}),22);
 assert.equal(rankRow('city',{cityRank:0,rank:22}),22);
 assert.equal(rankRow('city',{cityRank:null,schoolRank:5,rank:null}),null);
 assert.equal(rankRow('school',{schoolRank:7,cityRank:2,rank:9}),7);
 assert.equal(rankRow('school',{schoolRank:null,cityRank:2,rank:9}),9);
 assert.equal(rankRow('school',{schoolRank:null,cityRank:2,rank:null}),null);
 assert.equal(rankRow('school',{schoolRank:0,cityRank:2,rank:0}),null);
});
