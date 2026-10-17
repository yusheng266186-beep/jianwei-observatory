const labels=value=>[...new Set(String(value||'').split(/[,，;；、|]/).map(s=>s.trim()).filter(s=>s&&!/未标注|待补|未提供/.test(s)))];
export function exerciseExams(atlas,sid,subject){return atlas.materialStory(sid).filter(row=>Object.hasOwn(row.subjects||{},subject)||(atlas.personAnswers.get(sid+'|'+row.exam)||[]).some(a=>a.subject===subject&&a.classNo===row.classNo));}
export function analyzeExerciseBasis(atlas,{sid,subject,exam,mode='latest',exams=[],plan}={}){
 const available=exerciseExams(atlas,sid,subject),selected=mode==='common'?available.filter(r=>exams.includes(r.exam)).slice(-6):[available.find(r=>r.exam===exam)||available.at(-1)].filter(Boolean),items=[],groups=new Map();
 for(const [index,row] of selected.entries()){const planned=mode==='latest'&&plan?.training?.key===subject+'|'+row.exam&&plan.training.questions?.length?plan.training.questions:null;for(const e of (planned||atlas.questionsFor(row,subject)).filter(q=>Number.isFinite(q.score)&&Number.isFinite(q.max)&&q.max>0&&q.score>=0&&q.score<q.max).map(q=>({label:String(q.label),knowledge:String(q.knowledge||'').replace(/^知识点未标注$/,''),score:q.score,max:q.max}))){
  const item={...e,exam:index+1};items.push(item);
  for(const label of labels(e.knowledge)){if(!groups.has(label))groups.set(label,{label,exams:new Set(),items:[]});const group=groups.get(label);group.exams.add(index+1);group.items.push(item);}
 }}
 const recurring=[...groups.values()].filter(g=>mode!=='common'||g.exams.size>=2).map(g=>({knowledge:g.label,examCount:g.exams.size,score:g.items.reduce((s,e)=>s+e.score,0),max:g.items.reduce((s,e)=>s+e.max,0),items:g.items.length})).sort((a,b)=>b.examCount-a.examCount||a.score/a.max-b.score/b.max).slice(0,10);
 const shared=new Set(recurring.map(g=>g.knowledge)),evidence=(mode==='manual'?[]:mode==='common'?items.filter(e=>labels(e.knowledge).some(k=>shared.has(k))):items).sort((a,b)=>a.score/a.max-b.score/b.max).slice(0,24);
 return {mode,rows:selected,evidence,recurring,unlabelled:items.filter(e=>!labels(e.knowledge).length).length,focus:mode==='manual'?'':recurring.slice(0,4).map(g=>g.knowledge).join('、'),basis:{mode,examCount:mode==='manual'?0:selected.length,weakPoints:mode==='manual'?[]:recurring}};
}
