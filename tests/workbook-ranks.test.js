import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseWorkbook,parseFlat,mergeDatasets} from '../app/data/parser.js';
import {Atlas} from '../app/engine/atlas.js';
const sandbox={console,setTimeout,clearTimeout,TextEncoder,TextDecoder};vm.runInNewContext(readFileSync(new URL('../vendor/xlsx.full.min.js',import.meta.url),'utf8'),sandbox);const XLSX=sandbox.XLSX;
function workbook(records) {
 const rows=[['考试','学校','班级','姓名','原分','总分','百分等级','市排名','辅助列','校排名'],...records.map((record,i)=>{const row=Array(39).fill(null);Object.assign(row,{0:record.exam+'物',1:'荣县一中',2:4,3:'匿名学生'+i,4:420,5:450,7:record.city,9:record.school,10:90,11:100,12:15});return row;})],book=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),'学生基础');return XLSX.write(book,{type:'array',bookType:'xlsx'});
}
test('统考含明确校排名时同时导入市排和校排，4册及其他考次不再丢失校排',()=>{
 const records=['入口','1册','2册','3册','4册','4测'].map(exam=>({exam,city:1400,school:28})),data=parseWorkbook(XLSX,workbook(records),'匿名原表.xlsx'),atlas=new Atlas(data);
 assert.equal(data.scores.length,records.length);
 for(const row of data.scores){assert.equal(row.schoolRank,28);assert.equal(atlas.gradeRank(row),28);if(row.exam!=='4测')assert.equal(row.cityRank,1400);}
});
test('任何考次缺校排都保持未知，市排不转为校排',()=>{
 const records=[{exam:'4册',city:1400,school:null},{exam:'51',city:31,school:null},{exam:'52',city:1400,school:28}],data=parseWorkbook(XLSX,workbook(records),'匿名缺排名.xlsx'),atlas=new Atlas(data);
 assert.equal(data.scores[0].cityRank,1400);assert.equal(atlas.gradeRank(data.scores[0]),null);assert.equal(atlas.gradeRank(data.scores[1]),null);assert.equal(atlas.gradeRank(data.scores[2]),28);
});
test('重新合并原表能补回旧版丢失的4册校排，保留学生与原市排',()=>{
 const source=parseWorkbook(XLSX,workbook([{exam:'4册',city:1400,school:28}]),'匿名补排.xlsx'),before=structuredClone(source);before.scores[0].schoolRank=null;
 const repaired=mergeDatasets(before,source),atlas=new Atlas(repaired);assert.equal(repaired.students.length,1);assert.equal(repaired.scores.length,1);assert.equal(repaired.scores[0].cityRank,1400);assert.equal(atlas.gradeRank(repaired.scores[0]),28);assert.equal(repaired.students[0].id,before.students[0].id);
});
test('平面成绩表的年级排名与校排名列都能导入，不误读市排名',()=>{
 for(const column of ['校排名','校名次','校排','年级排名','年级名次']){const data=parseFlat([['姓名','班级','考试','总分','市排名',column],['匿名学生',4,'4册',450,1400,28]],'匿名排名.csv');assert.equal(data.scores[0].cityRank,1400);assert.equal(new Atlas(data).gradeRank(data.scores[0]),28);}
});

test('交接表复用校原名/校赋名表头的历史块按原表实际范围导入，不把班排2写成校排',()=>{
 const rows=[['考试','学校','班级','姓名','原分','总分','市原名','市赋名','校原名','校赋名'],['41物','荣县一中',4,'匿名校验',488.5,488.5,11,11,null,2],['2册物','荣县一中',4,'匿名校验',442,467,3100,3148,63,2]],book=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),'学生基础');const data=parseWorkbook(XLSX,XLSX.write(book,{type:'array',bookType:'xlsx'}),'匿名模板核验.xlsx');
 assert.deepEqual(data.scores.map(r=>[r.schoolRank,r.classRank,r.cityRank]),[[11,2,null],[63,2,3148]]);
});
