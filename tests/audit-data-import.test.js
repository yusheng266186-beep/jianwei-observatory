import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseWorkbook,parseFlat} from '../app/data/parser.js';
import {normalizeDataset} from '../app/data/compat.js';
import {importDecisionsComplete,resolveImportConflicts} from '../app/data/import-conflicts.js';
const sandbox={console,setTimeout,clearTimeout,TextEncoder,TextDecoder};
vm.runInNewContext(readFileSync(new URL('../vendor/xlsx.full.min.js',import.meta.url),'utf8'),sandbox);
const XLSX=sandbox.XLSX;
const HEADER=['考试','学校','班级','姓名','原始总分','赋分总分','原分市排名','赋分市排名','原分校排名','赋分校排名'];
function row({exam='52物',school='荣县一中',classNo=4,name='匿名甲',rawTotal=420,total=450,values={}}={}){
 const cells=Array(39).fill(null);Object.assign(cells,{0:exam,1:school,2:classNo,3:name,4:rawTotal,5:total});
 for(const [column,value] of Object.entries(values))cells[Number(column)]=value;
 return cells;
}
function book(rows,{merges=[],sheets={}}={}){
 const sheet=XLSX.utils.aoa_to_sheet([HEADER,...rows]);if(merges.length)sheet['!merges']=merges;
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,sheet,'学生基础');
 for(const [name,data] of Object.entries(sheets))XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(data),name);
 return XLSX.write(workbook,{type:'array',bookType:'xlsx'});
}
const parse=(rows,options)=>parseWorkbook(XLSX,book(rows,options),'匿名审计.xlsx');

test('D01 固定模板选考科仅有原分时保留原分，赋分与总分为空不伪造',()=>{
 const values={22:60,26:61,30:62,34:63,10:90};
 const data=parse([row({values})]),score=data.scores[0];
 assert.deepEqual(['政治','地理','化学','生物'].map(subject=>[subject,score.subjects[subject]?.score,score.subjects[subject]?.raw]),[
  ['政治',null,60],['地理',null,61],['化学',null,62],['生物',null,63]
 ]);
 assert.equal(score.subjects['语文'].score,90);assert.equal(score.subjects['语文'].raw,90);assert.equal(score.total,450);
 const both=parse([row({values:{23:70,27:71,31:72,35:73,22:60,26:61,30:62,34:63}})]).scores[0];
 assert.deepEqual(['政治','地理','化学','生物'].map(subject=>[both.subjects[subject].score,both.subjects[subject].raw]),[[70,60],[71,61],[72,62],[73,63]]);
 const blank=parse([row()]).scores[0];
 assert.ok(!blank.subjects['政治']);assert.ok(!blank.subjects['地理']);
});

test('D02 固定模板重复行按身份合并：空白保留、0更新、相同行只留一条',()=>{
 const complete=row({values:{10:90,13:80}}),blank=row({rawTotal:null,total:null});
 const merged=parse([complete,blank]);
 assert.equal(merged.scores.length,1);assert.equal(merged.scores[0].total,450);assert.equal(merged.scores[0].rawTotal,420);
 assert.equal(merged.scores[0].subjects['语文'].score,90);assert.equal(merged.scores[0].subjects['数学'].score,80);
 assert.equal(merged.importReport.duplicates.mergedScores,1);
 const zero=parse([row({rawTotal:null,total:null,values:{10:null}}),row({rawTotal:null,total:0,values:{10:0}})]);
 assert.equal(zero.scores[0].total,0);assert.equal(zero.scores[0].subjects['语文'].score,0);
 const repeated=parse([complete,row({values:{10:90,13:80}})]);
 assert.equal(repeated.scores.length,1);assert.equal(repeated.scores[0].total,450);
});

test('D02 不同有效值在预览中等待明确选择，不静默覆盖或阻断全部材料',()=>{
 for(const data of [parse([row({total:450}),row({total:400})]),parse([row({values:{10:90}}),row({values:{10:91}})]),parseFlat([['姓名','班级','考试','总分','学生识别码'],['同名学生',4,'52',500,'001'],['同名学生',4,'52',450,'001']],'匿名.csv')]){
  assert.equal(data.importConflicts.length,1);assert.equal(importDecisionsComplete(data),false);
  assert.throws(()=>resolveImportConflicts(data,[]),/请先确认/);
  const group=data.importConflicts[0],field=group.conflicts[0],path=record=>field.subject?record.subjects[field.subject][field.field]:record[field.field];
  assert.equal(path(resolveImportConflicts(data,['previous']).scores[0]),field.previous);
  assert.equal(path(resolveImportConflicts(data,['incoming']).scores[0]),field.incoming);
  assert.equal(data.importConflicts.length,1);
 }
});
test('D02 三条以上重复记录按当前差异选择，互不覆盖其他字段，保留补充和0',()=>{
 const data=parse([row({values:{10:90,13:80}}),row({values:{10:91,16:0}}),row({values:{13:82,19:50}})]);
 assert.equal(data.importConflicts.length,2);
 const result=resolveImportConflicts(data,['incoming','previous']).scores[0];
 assert.equal(result.subjects.语文.score,91);assert.equal(result.subjects.数学.score,80);
 assert.equal(result.subjects.英语.score,0);assert.equal(result.subjects.物理.score,50);
 const sameField=parse([row({total:450}),row({total:400}),row({total:300})]);
 assert.equal(resolveImportConflicts(sameField,['incoming','previous']).scores[0].total,450);
 assert.equal(resolveImportConflicts(sameField,['previous','incoming']).scores[0].total,300);
});

test('D02 归一化不再最后一行覆盖，冲突保留首个有效值并写入可见记录',()=>{
 const first={exam:'52',sid:'s1',classNo:4,track:'physics',total:450,rawTotal:420,subjects:{语文:{score:90,raw:90}}};
 const data=normalizeDataset({students:[{id:'s1',name:'匿名甲'}],scores:[first,{...structuredClone(first),total:null,rawTotal:null,subjects:{}}],answers:[],exams:[],lines:[]});
 assert.equal(data.scores.length,1);assert.equal(data.scores[0].total,450);assert.equal(data.scores[0].subjects['语文'].score,90);
 assert.ok(!data.mergeConflicts);
 const conflict=normalizeDataset({students:[{id:'s1',name:'匿名甲'}],scores:[first,{...structuredClone(first),total:400}],answers:[],exams:[],lines:[]});
 assert.equal(conflict.scores.length,1);assert.equal(conflict.scores[0].total,450);assert.equal(conflict.mergeConflicts.length,1);
 assert.equal(conflict.mergeConflicts[0].field,'total');assert.equal(conflict.mergeConflicts[0].previous,450);assert.equal(conflict.mergeConflicts[0].incoming,400);
 const answers=normalizeDataset({students:[{id:'s1',name:'匿名甲'}],scores:[],answers:[{exam:'52',sid:'s1',classNo:4,subject:'数学',values:[5,null]},{exam:'52',sid:'s1',classNo:4,subject:'数学',values:[null,0]}],exams:[],lines:[]});
 assert.deepEqual(answers.answers[0].values,[5,0]);
 const answerConflict=normalizeDataset({students:[{id:'s1',name:'匿名甲'}],scores:[],answers:[{exam:'52',sid:'s1',classNo:4,subject:'数学',values:[5,0]},{exam:'52',sid:'s1',classNo:4,subject:'数学',values:[null,7]}],exams:[],lines:[]});
 assert.deepEqual(answerConflict.answers[0].values,[5,0]);assert.equal(answerConflict.mergeConflicts[0].field,'values.1');
});

test('D02 固定模板重复小题行同样空白补充、0更新并等待确认差异',()=>{
 const sheet=[[null,'52物','题号','1','2'],[null,null,'分值',5,5],[null,null,'知识点','函数','函数'],['52物',4,'匿名甲',3,null],['52物',4,'匿名甲',null,0]];
 const data=parse([row({name:'匿名甲'})],{sheets:{数学:sheet}});
 assert.equal(data.answers.length,1);assert.deepEqual(data.answers[0].values,[3,0]);assert.equal(data.importReport.duplicates.mergedAnswers,1);
 const conflict=[...sheet.slice(0,4),['52物',4,'匿名甲',4,0]];
 const review=parse([row({name:'匿名甲'})],{sheets:{数学:conflict}});assert.equal(importDecisionsComplete(review,[]),false);assert.deepEqual(resolveImportConflicts(review,['incoming']).answers[0].values,[4,0]);assert.deepEqual(resolveImportConflicts(review,['previous']).answers[0].values,[3,0]);
});

test('D08 本校全称、空学校与合并单元格继续导入，并保留我校标准名',()=>{
 const alias=parse([row({school:'荣县第一中学',name:'匿名甲'}),row({school:' 荣县第一中学 ',name:'匿名乙'})]);
 assert.equal(alias.scores.length,2);assert.equal(alias.school,'荣县一中');assert.equal(alias.importReport.school.excludedRows,0);
 const blank=parse([row({school:null,name:'匿名甲'}),row({school:null,name:'匿名乙'})]);
 assert.equal(blank.scores.length,2);assert.equal(blank.school,'荣县一中');
 const mergedCell=parse([row({school:'荣县第一中学',name:'匿名甲'}),row({school:null,name:'匿名乙'})],{merges:[{s:{r:1,c:1},e:{r:2,c:1}}]});
 assert.equal(mergedCell.scores.length,2);assert.equal(mergedCell.school,'荣县一中');
});

test('D08 别校记录被排除并统计，空白续行不绕过本校范围过滤',()=>{
 const mixed=parse([row({school:'荣县一中',name:'匿名甲'}),row({school:'别校中学',name:'匿名乙'})]);
 assert.deepEqual(mixed.students.map(person=>person.name),['匿名甲']);
 assert.equal(mixed.scores.length,1);assert.equal(mixed.importReport.school.acceptedRows,1);assert.equal(mixed.importReport.school.excludedRows,1);
 assert.ok(mixed.importReport.school.names.includes('别校中学'));
 const allOther=parse([row({school:'别校甲',name:'匿名甲'}),row({school:'别校乙',name:'匿名乙'})]);
 assert.equal(allOther.scores.length,0);assert.equal(allOther.students.length,0);assert.equal(allOther.importReport.school.excludedRows,2);
});
