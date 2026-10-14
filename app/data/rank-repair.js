import {sourceRankReference} from './rank-reference.js?v=runtime-v43';
import {explicitRanks,validRank} from '../engine/ranking.js?v=runtime-v43';
function explicitRankHeadings(row){
 if(!explicitRanks(row))return false;
 if(row.rankProvenance==='column-headings-v2')return true;
 // Only the supplied older template reused 校原名/校赋名 for other scopes.
 // A newly mapped school/city column, including a blank value, is authoritative.
 const labels=Object.values(row.rankSources||{}).map(label=>String(label).replace(/\s/g,''));
 return labels.some(label=>/班/.test(label))||!labels.some(label=>/^校[原赋]名$/.test(label));
}
export function rankFingerprint(row){
 const key=[row.rawExam,row.sourceRow,row.classNo,row.rawTotal,row.total].join('|');
 let a=2166136261,b=2246822519;
 for(const char of key){a=Math.imul(a^char.codePointAt(0),16777619);b=Math.imul(b^char.codePointAt(0),3266489917);}
 return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
}
export function repairSourceRanks(data){
 for(const row of data.scores){
  const values=row.sourceRow&&sourceRankReference[rankFingerprint(row)];
  if(!values||row.rankProvenance==='source-audit-v2')continue;
  // Explicit class/school headings in a newly mapped workbook remain authoritative.
  if(explicitRankHeadings(row))continue;
  row.originalRanks||={schoolRank:row.schoolRank??null,classRank:row.classRank??null,cityRank:row.cityRank??null};
  [row.schoolRank,row.classRank,row.cityRank]=values;
  row.rankSources=Object.fromEntries(['schoolRank','classRank','cityRank'].filter(k=>validRank(row[k])).map(k=>[k,'原表对应名次列']));
  row.rankProvenance='source-audit-v2';
  for(const [subject,score] of Object.entries(row.subjects||{})){
   if(explicitRanks(score))continue;
   if(['51','52','21','33','4册'].includes(row.exam)){
    score.rankSources={};score.rankProvenance='source-audit-v2';
    if(validRank(score.schoolRank))score.rankSources.schoolRank='原表学科校排名';
    else if(['51','52','21','33'].includes(row.exam)&&validRank(score.rank)){score.schoolRank=score.rank;score.rankSources.schoolRank='原表学科校排名';}
   }else if(row.exam==='43'){
    score.classRank=score.schoolRank??score.rank;score.schoolRank=score.schoolRank==null?null:score.rank;
    score.rankSources={...(validRank(score.schoolRank)?{schoolRank:'原表学科校排名'}:{}),...(validRank(score.classRank)?{classRank:'原表学科班排名'}:{})};score.rankProvenance='source-audit-v2';
   }else if(row.exam==='41'&&validRank(score.rank)){
    score.schoolRank=score.rank;score.rankSources={schoolRank:'原表学科校排名'};score.rankProvenance='source-audit-v2';
   }
  }
 }
 return data;
}
