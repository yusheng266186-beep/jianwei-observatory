const fold=subject=>['英语','日语'].includes(subject)?'外语':subject;
export function reportSubjects(atlas,exam){
 return [...new Set([...atlas.rows(exam).flatMap(row=>Object.keys(row.subjects||{})),...atlas.data.answers.filter(row=>row.exam===exam).map(row=>row.subject)].map(fold))];
}
export function reportClasses(atlas,{kind='class',exam=atlas.latest,subject='all'}={}){
 if(kind==='follow')return atlas.classes;
 const scores=atlas.rows(exam),answers=kind==='class'?[]:atlas.data.answers.filter(row=>row.exam===exam);
 const rows=kind==='subject'?[...scores.filter(row=>Object.keys(row.subjects||{}).some(name=>subject==='all'||fold(name)===fold(subject))),...answers.filter(row=>subject==='all'||fold(row.subject)===fold(subject))]:[...scores,...answers];
 return [...new Set(rows.map(row=>Number(row.classNo)))].sort((a,b)=>a-b);
}
export function reportExams(atlas,kind){return atlas.exams.filter(exam=>reportClasses(atlas,{kind,exam:exam.id}).length);}
