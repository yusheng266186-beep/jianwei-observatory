import {contentStamp} from './content-stamp.js';
import {validDate} from './training.js';
export const feedbackMarks=[['concept','概念理解'],['method','方法选择'],['calculation','计算'],['reading','审题'],['expression','表达与规范']];
// Layout is reviewable, but moving or resizing the same figure does not change
// the questions a pupil answered. Actual diagram/content edits still do.
export const practiceSourceStamp=record=>contentStamp({...record.sheet,questions:record.sheet.questions.map(({figureLayout,...question})=>question)});
export function practiceFeedbackCurrent(record){const feedback=record?.practiceFeedback;return !!feedback&&Array.isArray(record?.sheet?.questions)&&feedback.source===(feedback.version===2?practiceSourceStamp(record):contentStamp(record.sheet));}
export function practiceFeedbackStamp(record){const value=record.practiceFeedback;return contentStamp(value&&practiceFeedbackCurrent(record)?{...value,version:2,source:practiceSourceStamp(record)}:value||null);}
export function preservePracticeFeedbackLayout(record){if(record?.practiceFeedback&&practiceFeedbackCurrent(record)&&record.practiceFeedback.version!==2)record.practiceFeedback={...record.practiceFeedback,version:2,source:practiceSourceStamp(record)};}
export function practiceFeedbackDraft(record,date){const old=practiceFeedbackCurrent(record)?record.practiceFeedback:null;return {expected:practiceFeedbackStamp(record),date:old?.date||date,note:old?.note||'',rows:record.sheet.questions.map(q=>{const row=old?.rows.find(r=>r.id===q.id);return row?structuredClone(row):{id:q.id,state:'ungraded',score:null,marks:[]};})};}
export function validatePracticeFeedback(record,value,{now=Date.now()}={}){
 if(!record.reviewedAt)throw new Error('请先审定练习，再记录练后结果');
 if(!value||!validDate(value.date))throw new Error('请选择真实的练习日期');
 if(!Array.isArray(value.rows)||value.rows.length!==record.sheet.questions.length)throw new Error('逐题记录不完整，请重新打开');
 const note=String(value.note||'').trim();if(note.length>600)throw new Error('教师记录最多600字');
 const rows=record.sheet.questions.map((q,i)=>{const r=value.rows[i];if(r.id!==q.id||!['ungraded','scored','unanswered'].includes(r.state))throw new Error('逐题记录与当前试题不一致');const marks=r.marks||[];if(!Array.isArray(marks)||new Set(marks).size!==marks.length||marks.some(m=>!feedbackMarks.some(([id])=>id===m)))throw new Error('请选择有效的错因标记');let score=r.state==='unanswered'?0:r.state==='ungraded'?null:r.score;if(score!==null&&(!Number.isFinite(score)||score<0||score>q.maxScore))throw new Error('第'+q.id+'题得分应在0至'+q.maxScore+'分之间');return {id:q.id,state:r.state,score,marks:[...marks]};});
 return {version:2,source:practiceSourceStamp(record),date:value.date,note,rows,updatedAt:now};
}
export function practiceFeedbackMetrics(record){
 if(!practiceFeedbackCurrent(record))return null;const feedback=record.practiceFeedback,byId=new Map(record.sheet.questions.map(q=>[q.id,q])),graded=feedback.rows.filter(r=>r.state!=='ungraded'),score=graded.reduce((n,r)=>n+r.score,0),max=graded.reduce((n,r)=>n+byId.get(r.id).maxScore,0);
 return {score,max,rate:max?score/max:null,graded:graded.length,total:feedback.rows.length,unanswered:graded.filter(r=>r.state==='unanswered').length,date:feedback.date};
}
export function practiceFeedbackSummary(record){const m=practiceFeedbackMetrics(record);return m?'练后 '+m.graded+'/'+m.total+'题已批改'+(m.graded?' · '+m.score+'/'+m.max+'分':'')+(m.unanswered?' · '+m.unanswered+'题未作答':''):record?.practiceFeedback?(Array.isArray(record.sheet?.questions)?'练习已修改，原练后记录保留':'练后记录已保留，题目载入后可查看'):'尚未记录练后结果';}
export function practiceKnowledgeHistory(records,{sid,subject}){
 const groups=new Map();for(const r of records.filter(r=>r.sid===sid&&r.request?.subject===subject&&practiceFeedbackCurrent(r))){const per=new Map();for(const item of r.practiceFeedback.rows){if(item.state==='ungraded')continue;const q=r.sheet.questions.find(q=>q.id===item.id),target=q?.target;if(!target)continue;if(!per.has(target))per.set(target,{score:0,max:0});const g=per.get(target);g.score+=item.score;g.max+=q.maxScore;}for(const [target,g] of per){if(!groups.has(target))groups.set(target,[]);groups.get(target).push({id:r.id,date:r.practiceFeedback.date,at:r.practiceFeedback.updatedAt,rate:g.score/g.max,score:g.score,max:g.max});}}
 return [...groups].map(([target,samples])=>({target,samples:samples.sort((a,b)=>a.date.localeCompare(b.date)||a.at-b.at).slice(-5)}));
}
export function mergePracticeFeedback(latest,record,feedback,expected){const at=latest.findIndex(r=>r.id===record.id);if(at<0)throw new Error('这份练习已被删除，未写入结果');const saved=latest[at];if(practiceSourceStamp(saved)!==feedback.source||practiceFeedbackStamp(saved)!==expected)throw new Error('试题或练后记录已在其他页面更新，请重新打开后记录');return latest.map((r,i)=>i===at?{...r,practiceFeedback:feedback}:r);}
