import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {parseWorkbook,mergeDatasets} from '../app/data/parser.js';
import {Atlas} from '../app/engine/atlas.js';
import {selectedReport} from '../app/engine/report-selection.js';
import {documentSections} from '../app/io/print-document.js';
import {buildTeachingReport} from '../app/engine/reports.js';
import {prepareReportFonts} from '../app/io/report-fonts.js';
const {makeFixture}=createRequire(import.meta.url)('./fixtures.cjs');
const sandbox={console,setTimeout,clearTimeout,TextEncoder,TextDecoder};
vm.runInNewContext(readFileSync(new URL('../vendor/xlsx.full.min.js',import.meta.url),'utf8'),sandbox);
const XLSX=sandbox.XLSX;
function rankedWorkbook(headers){
 const row=Array(39).fill(null);
 Object.assign(row,{0:'52物',1:'荣县一中',2:4,3:'匿名排名核查',4:430,5:450,7:1400,8:217,9:2,10:90,11:18,12:3});
 const book=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([headers,row]),'学生基础');
 return XLSX.write(book,{type:'array',bookType:'xlsx'});
}
test('标准表的第10列为班排时，不会再把班排2冒充年级排名；校排217由列名定位',()=>{
 const headers=['考试','学校','班级','姓名','原分','总分','百分等级','市排名','校排名','班级排名','语文成绩','语文校排','语文班排'];
 const data=parseWorkbook(XLSX,rankedWorkbook(headers),'匿名排名核查.xlsx'),row=data.scores[0],atlas=new Atlas(data);
 assert.equal(row.cityRank,1400);assert.equal(row.schoolRank,217);assert.equal(row.classRank,2);
 assert.equal(row.subjects.语文.schoolRank,18);assert.equal(row.subjects.语文.classRank,3);
 const report=buildTeachingReport(atlas,{kind:'student',exam:'52',sid:row.sid});
 const summary=report.sections.find(s=>s.title==='本场学习概况').rows;
 assert.equal(summary.find(r=>r[0].startsWith('年级排名'))[1],'第217名');
 assert.equal(summary.find(r=>r[0].startsWith('班级排名'))[1],'第2名');
 assert.match(report.sections.find(s=>s.title==='学科短板与改进方向').rows[0][2],/校排 18\n班排 3/);
});
test('考试为校内考试也不能让未标范围的排名成为年级排名',()=>{
 const data=makeFixture(),row=data.scores.find(r=>r.exam==='52'&&r.sid==='test-4-0');
 row.schoolRank=null;row.classRank=2;row.rank=1;
 const atlas=new Atlas(data),report=buildTeachingReport(atlas,{kind:'student',exam:'52',sid:row.sid});
 assert.equal(atlas.gradeRank(row),null);
 assert.equal(report.sections[0].rows.find(r=>r[0].startsWith('年级排名'))[1],'未提供');
 assert.match(report.sections[1].rows.at(-1)[3],/班排 2/);
});
test('旧标准导入未保留表头时，数字保留为待核实而非冒充年级排名',()=>{
 const data=makeFixture(),row=data.scores.find(r=>r.exam==='52'&&r.sid==='test-4-0');row.schoolRank=2;row.sourceRow=40;
 const atlas=new Atlas(data),report=buildTeachingReport(atlas,{kind:'student',exam:'52',sid:row.sid});
 assert.equal(atlas.gradeRank(row),null);assert.equal(row.schoolRank,2);
 assert.match(report.sections[0].rows.find(r=>r[0].startsWith('年级排名'))[1],/待核实/);
 assert.match(report.sections[1].rows.at(-1)[3],/旧导入 2（范围待核实）/);
});
test('重新合并有明确排名列的原表能纠正旧字段，原分与学生关联继续保留',()=>{
 const source=parseWorkbook(XLSX,rankedWorkbook(['考试','学校','班级','姓名','原分','总分','','市排名','校排名','班排']),'匿名校准.xlsx');
 const old=structuredClone(source);old.scores[0].schoolRank=2;delete old.scores[0].rankSources;delete old.scores[0].rankProvenance;
 const repaired=mergeDatasets(old,source);assert.equal(repaired.scores[0].schoolRank,217);assert.equal(repaired.scores[0].classRank,2);assert.equal(repaired.scores[0].total,450);assert.equal(repaired.students.length,1);
});
test('按知识点行标题读取并展开显式合并单元格，未标注题保持未知，不复制满分',()=>{
 const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([
  [null,52,'题号','1','2','3'],[null,null,'说明'],[null,null,'满分',5,null,10],
  [null,null,'考查知识点','函数',null,null],['52物',4,'匿名知识点',[0][0],4,7]
 ]);sheet['!merges']=[{s:{r:3,c:3},e:{r:3,c:4}}];
 XLSX.utils.book_append_sheet(book,sheet,'数学');
 const data=parseWorkbook(XLSX,XLSX.write(book,{type:'array',bookType:'xlsx'}),'匿名合并知识点.xlsx');
 assert.deepEqual(data.banks['数学|52'].map(q=>q.knowledge),['函数','函数','']);
 assert.deepEqual(data.banks['数学|52'].map(q=>q.max),[5,null,10]);
 assert.deepEqual(data.answers[0].values,[0,4,7]);
});
test('按实际文字选择打印字体分片，生僻字、混合粗细和页脚数字仍保留原文',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../assets/report-fonts/manifest.json',import.meta.url),'utf8'));
 const prepared=prepareReportFonts({content:[{text:'核查龘同学',bold:true},{table:{body:[['真实0分',0]]}}],footer:n=>({text:'第'+n+'页',font:'Report'})},manifest);
 const runs=prepared.definition.content[0].text;
 assert.equal(runs.map(r=>r.text).join(''),'核查龘同学');assert(prepared.parts.some(p=>p.id!=='core'));
 assert.equal(prepared.definition.footer(17).text.map(r=>r.text).join(''),'第17页');
 assert(prepared.parts.length<6);
});

test('旧学生报告快照保留数值，但打印时不继续把未核验的历史排名称为年级排名',()=>{
 const saved={kind:'student',sections:[{title:'阶段成绩变化',headers:['考试','年级排名'],rows:[['旧考次','2']]}]};
 saved.sheets={'阶段':[['考试','年级排名'],['旧考次','2']]};const before=structuredClone(saved),print=documentSections(saved);assert.match(selectedReport(saved).sheets.阶段[0][1],/历史排名.*待核实/);
 assert.deepEqual(saved,before);assert.equal(print[0].rows[0][1],'2');assert.match(print[0].headers[1],/历史排名.*待核实/);assert.match(print[0].caption,/原快照数值保留/);
});
