import {valid} from './metrics.js';
import {classMatrixRows,researchNameMatch} from './research-history.js';
export function researchRoster(atlas,rows,{search='',sort='source'}={}){
 const result=rows.filter(r=>researchNameMatch(atlas.name(r.sid),search));
 const byName=(a,b)=>atlas.name(a.sid).localeCompare(atlas.name(b.sid),'zh-CN',{numeric:true});
 if(sort==='name')return result.sort(byName);
 if(!['total','low','gap'].includes(sort))return result;
 const value=r=>sort==='gap'?atlas.gap(r,'under'):r.total;
 return result.sort((a,b)=>{const x=value(a),y=value(b);if(!valid(x)||!valid(y))return !valid(x)&&!valid(y)?byName(a,b):!valid(x)?1:-1;return (sort==='low'?x-y:y-x)||byName(a,b);});
}
// Scene tables and the observation window share the exact same full result order.
export function researchObservationList(atlas,scene,state,exam){
 if(scene==='board')return {records:researchRoster(atlas,atlas.rows(exam),state.mode==='roster'?state:{}).map(r=>({sid:r.sid,exam:r.exam})),label:'本场年级名单'};
 const no=state.no||atlas.classes[0];
 if(state.tab==='history')return {records:classMatrixRows(atlas,atlas.timeline(no,state.exams||[],state.matched),state).map(r=>({sid:r.sid,exam:r.exam})),label:no+'班 · 当前纵向矩阵'};
 if(state.tab==='targets')return {records:atlas.critical(exam,{tier:state.tier||'under',band:20,classes:[Number(no)]}).map(({row})=>({sid:row.sid,exam:row.exam})),label:no+'班 · '+(state.tier==='top'?'特控':'本科')+'线下20分'};
 return {records:researchRoster(atlas,atlas.classAt(no,exam),{...state,sort:state.sort||'total'}).map(r=>({sid:r.sid,exam:r.exam})),label:no+'班 · 本场名单'};
}
