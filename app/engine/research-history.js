import {valid,difference} from './metrics.js';
export const rankMetric=metric=>['rank','gradeRank','classRank'].includes(metric);
const track=(atlas,row)=>row.track||atlas.profile(row.classNo).track;
export function stageComparison(atlas,records,metric='total'){
 const measured=records.filter(Boolean).map(row=>({row,value:atlas.value(row,metric)})).filter(item=>valid(item.value)),first=measured[0],last=measured.at(-1);
 let reason=measured.length<2?'insufficient':'';
 if(!reason&&['rank','gradeRank','classRank','percentile'].includes(metric)&&track(atlas,first.row)!==track(atlas,last.row))reason='track';
 if(!reason&&metric==='classRank'&&Number(first.row.classNo)!==Number(last.row.classNo))reason='class';
 if(!reason&&metric==='rank'&&(atlas.exam(first.row.exam).scope==='city')!==(atlas.exam(last.row.exam).scope==='city'))reason='scope';
 const change=reason?null:difference(last.value,first.value);
 return {first,last,count:measured.length,change,improvement:change===null?null:rankMetric(metric)?-change:change,metric,reason};
}
export const matrixOrder=state=>['source','up','down'].includes(state.matrixOrder)?state.matrixOrder:state.growth?'up':'source';
export const researchNameMatch=(name,query)=>{const tokens=String(query||'').normalize('NFKC').split(/[,;\n]+/).map(v=>v.trim()).filter(Boolean);return !tokens.length||tokens.some(token=>String(name).normalize('NFKC').includes(token));};
export function classMatrixRows(atlas,timeline,state={}){
 const rows=[...new Set(timeline.flatMap(t=>t.rows.map(r=>r.sid)))].filter(sid=>researchNameMatch(atlas.name(sid),state.search)).map(sid=>{
  const records=timeline.map(t=>t.rows.find(r=>r.sid===sid)),comparison=stageComparison(atlas,records,state.matrix||'total');
  return {sid,records,comparison,change:comparison.change,exam:records.filter(Boolean).at(-1)?.exam};
 });
 const order=matrixOrder(state);if(order!=='source')rows.sort((a,b)=>{const x=a.comparison.improvement,y=b.comparison.improvement;if(x===null||y===null)return x===y?0:x===null?1:-1;return (order==='up'?y-x:x-y)||atlas.name(a.sid).localeCompare(atlas.name(b.sid),'zh-CN',{numeric:true});});
 return rows;
}
