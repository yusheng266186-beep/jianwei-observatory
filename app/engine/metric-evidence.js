import {legacyRanks,validRank} from './ranking.js';
import {valid} from './metrics.js';
// UI and report consume the same Atlas values. This explains provenance; it
// never reconstructs an absent school rank from the imported cohort.
export function studentMetricEvidence(atlas,row){
 if(!row)return [];
 const source=Number.isInteger(row.sourceRow)?'原表第'+row.sourceRow+'行':'本场成绩记录',classRank=atlas.classRank(row),supplied=!legacyRanks(row)&&validRank(row.classRank),count=atlas.classAt(row.classNo,row.exam).filter(r=>valid(r.total)).length;
 return [
 {label:'分析总分',value:valid(row.total)?row.total:null,basis:source+' · 保留导入数值'},
 ...(valid(row.rawTotal)?[{label:'原始总分',value:row.rawTotal,basis:source+' · 原分口径'}]:[]),
 {label:'校内排名',value:atlas.gradeRank(row),basis:atlas.gradeRank(row)==null?'采用原表校内名次；本场无可展示值':source+' · '+(row.rankSources?.schoolRank||'校内名次')},
 {label:'班级排名',value:classRank,basis:supplied?source+' · '+(row.rankSources?.classRank||'班内名次'):classRank==null?'本场无有效总分或同班成绩记录':row.classNo+'班 · 本场已导入'+count+'份有效总分，降序排列，同分并列；范围限于已导入材料'}
 ];
}
