import {exerciseSetupContent,applyExerciseSetup} from './exercise-setups.js';
import {analyzeExerciseBasis,exerciseExams} from './exercise-basis.js';
import {validateExerciseRequest} from './exercise-contract.js';
// Freeze teaching choices, then derive evidence independently for every pupil.
export function prepareExerciseBatch(atlas,request,sids,{exam,mode=request.basis?.mode||'latest',examCount=request.basis?.examCount||3,newId=()=>crypto.randomUUID(),now=Date.now(),service}={}){
 const content=exerciseSetupContent(request),group=newId(),records=[],skipped=[];
 for(const sid of [...new Set(sids)]){const available=exerciseExams(atlas,sid,content.subject),row=available.find(r=>r.exam===exam)||available.at(-1);if(!row){skipped.push({sid,reason:'该学科没有考试材料'});continue;}
 const sourceExams=mode==='common'?available.slice(-Math.max(2,Math.min(6,examCount))).map(r=>r.exam):[row.exam];const a=analyzeExerciseBasis(atlas,{sid,subject:content.subject,exam:row.exam,mode,exams:sourceExams});if(mode==='latest'&&!a.evidence.length){skipped.push({sid,reason:'本场没有可用失分依据'});continue;}if(mode==='common'&&(!a.recurring.length||a.rows.length<2)){skipped.push({sid,reason:'多考共性依据不足'});continue;}
 const input=validateExerciseRequest(applyExerciseSetup({content},{grade:'高三',subject:content.subject,evidence:a.evidence,basis:a.basis}));records.push({id:newId(),sid,exam:row.exam,request:input,sourceExams,status:'prepared',createdAt:now,reviewedAt:null,service,queueGroup:{id:group,name:content.subject+' · '+content.focus,order:records.length+1},student:{name:atlas.name(sid),classNo:row.classNo,examLabel:atlas.exam(row.exam).label}});
 }
 for(const r of records)r.queueGroup.total=records.length;return {records,skipped};
}
