import {mergeScoreRecord} from './merge-policy.js';
const key=row=>JSON.stringify([row.exam,row.classNo,row.sid,row.subject||'']);
export function collectImportConflict(data,kind,previous,incoming,conflicts){
 if(!conflicts.length)return;
 (data.importConflicts||=[]).push({kind,previous:structuredClone(previous),incoming:structuredClone(incoming),conflicts:structuredClone(conflicts)});
}
export const importDecisionsComplete=(data,choices=[])=>!data.importConflicts?.length||data.importConflicts.every((_,i)=>['previous','incoming'].includes(choices[i]));
export function resolveImportConflicts(data,choices){
 if(!importDecisionsComplete(data,choices))throw new Error('请先确认重复记录采用哪一份数值，再加入工作区。');
 const result=structuredClone(data),groups=result.importConflicts||[],scores=new Map(result.scores.map(row=>[key(row),row])),answers=new Map(result.answers.map(row=>[key(row),row]));
 for(const [i,group] of groups.entries()){
  const row=group.incoming,map=group.kind==='answer'?answers:scores,old=map.get(key(row)),selected=group[choices[i]];
  // Apply only the differences shown for this group. A third duplicate must
  // not undo a previous choice in an unrelated subject or erase supplements.
  const patch={exam:row.exam,sid:row.sid,classNo:row.classNo};
  if(group.kind==='answer'){
   const next=structuredClone(old);
   for(const item of group.conflicts){if(item.field.startsWith('values.'))next.values[Number(item.field.slice(7))]=item[choices[i]];else next[item.field]=item[choices[i]];}
   map.set(key(row),next);
  }else{
   for(const item of group.conflicts){
    const target=item.subject?((patch.subjects||={})[item.subject]||={}):patch;
    target[item.field]=item[choices[i]];
    const source=item.subject?selected.subjects?.[item.subject]:selected;
    if(source?.rankSources?.[item.field]){(target.rankSources||={})[item.field]=source.rankSources[item.field];}
    if(['total','rawTotal','score','raw'].includes(item.field))for(const field of ['rank','schoolRank','cityRank','classRank']){
     if(Number.isInteger(source?.[field])&&source[field]>0){target[field]=source[field];if(source.rankSources?.[field])(target.rankSources||={})[field]=source.rankSources[field];}
    }
   }
   map.set(key(row),mergeScoreRecord(old,patch));
  }
 }
 result.scores=[...scores.values()];result.answers=[...answers.values()];
 if(groups.length){result.importResolutions={version:1,records:groups.length,previous:groups.filter((_,i)=>choices[i]==='previous').length,incoming:groups.filter((_,i)=>choices[i]==='incoming').length};}
 const resolved=new Set(groups.flatMap(group=>group.conflicts.map(item=>item.key)));
 if(Array.isArray(result.mergeConflicts)){result.mergeConflicts=result.mergeConflicts.filter(item=>!resolved.has(item.key));if(!result.mergeConflicts.length)delete result.mergeConflicts;}
 delete result.importConflicts;
 return result;
}
