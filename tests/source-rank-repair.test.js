import test from 'node:test';
import assert from 'node:assert/strict';
import {repairSourceRanks} from '../app/data/rank-repair.js';
import {schoolRank,rankColumns} from '../app/engine/ranking.js';
// Anonymous score values already present in the published sample, checked
// against the handoff's preserved source cells. School and class differ.
const historical={exam:'41',rawExam:'41物',sourceRow:3865,classNo:4,total:488.5,rawTotal:488.5,schoolRank:2,subjects:{}};
test('恢复旧工作区时，原表校内第11名与班内第2名分别恢复，重载保持不变',()=>{
 const data={scores:[structuredClone(historical)]};repairSourceRanks(data);
 assert.equal(schoolRank(data.scores[0]),11);assert.equal(data.scores[0].classRank,2);assert.equal(data.scores[0].cityRank,null);
 const snapshot=structuredClone(data);repairSourceRanks(data);assert.deepEqual(data,snapshot);
});
test('联考校排采用原表对应单元格，不把市排3148或班排2冒充校排63',()=>{
 const row={exam:'2册',rawExam:'2册物',sourceRow:2354,classNo:4,total:467,rawTotal:442,schoolRank:null,cityRank:3148,subjects:{}};
 repairSourceRanks({scores:[row]});assert.equal(schoolRank(row),63);assert.equal(row.classRank,2);assert.equal(row.cityRank,3148);
});
test('成绩、班级或原始行位置变化的记录不能套用另一份原表的校排',()=>{
 for(const changed of [{total:489},{classNo:3},{sourceRow:3866},{rawTotal:480}]){
  const row={...historical,...changed};repairSourceRanks({scores:[row]});assert.equal(schoolRank(row),null);assert.equal(row.schoolRank,2);
 }
});
test('校赋名、市赋名、班赋名优先于原始分名次，与质量慧析的列名约定一致',()=>{
 const map=rankColumns([['市原名','市赋名','校原名','校赋名','班原名','班赋名']],0,5);
 assert.deepEqual(Object.fromEntries(Object.entries(map).map(([key,value])=>[key,value.column])),{cityRank:1,schoolRank:3,classRank:5});
});
