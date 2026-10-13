import {valid} from './metrics.js?v=paper-v30';

export const trainingTasks=[['concept','概念梳理'],['worked','例题讲解'],['same','同类练习'],['variation','变式迁移'],['correction','错题订正'],['retest','再测验']];
export const trainingMethods=[['individual','个别指导'],['group','小组互助'],['independent','独立训练'],['lesson','课堂专题']];
export const scheduleSlots=[['lesson','课内'],['break','课间'],['morning','早读'],['lunch','午间'],['evening','自习'],['custom','自定时刻']];
export const planStatuses=[['new','待开始'],['active','跟进中'],['done','已完成']];
export const todayLocal=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
export function validDate(date){return /^\d{4}-\d{2}-\d{2}$/.test(date||'')&&Number.isFinite(new Date(date+'T12:00:00Z').getTime())&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date;}
export function dateLabel(date){if(!validDate(date))return '日期待安排';const d=new Date(date+'T12:00:00Z');return date+' · 周'+['日','一','二','三','四','五','六'][d.getUTCDay()];}
export function dateChoices(base=todayLocal(),count=14){const start=new Date(base+'T12:00:00Z');return Array.from({length:count},(_,i)=>{const d=new Date(start);d.setUTCDate(d.getUTCDate()+i);const value=d.toISOString().slice(0,10);return {value,label:dateLabel(value)};});}
export function scheduleLabel(schedule={}){
 const slot=scheduleSlots.find(([id])=>id===schedule.slot)?.[1]||'时段待安排',period=['lesson','break'].includes(schedule.slot)&&schedule.period?'第'+schedule.period+'节'+(schedule.slot==='break'?'课后课间':'课'):slot;
 return [dateLabel(schedule.date),period,schedule.time||'',schedule.duration?schedule.duration+'分钟':''].filter(Boolean).join(' · ');
}
export function normalizePlan(plan){return {...plan,status:plan.status==='doing'?'active':planStatuses.some(([id])=>id===plan.status)?plan.status:'new',schedule:{...plan.schedule},training:{...plan.training,questions:Array.isArray(plan.training?.questions)?plan.training.questions:[],tasks:Array.isArray(plan.training?.tasks)?plan.training.tasks:[]}};}
export function planMatchesTime(plan,filter='all',today=todayLocal()){
 const date=validDate(plan.schedule?.date)?plan.schedule.date:'';if(filter==='unscheduled')return !date;if(filter==='today')return date===today;if(filter==='overdue')return !!date&&date<today&&plan.status!=='done';
 if(filter==='week'){const d=new Date(today+'T12:00:00Z'),weekday=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-weekday);const start=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);return !!date&&date>=start&&date<=d.toISOString().slice(0,10);}return true;
}
export function questionOptions(atlas,{sid,exam,key}){
 const row=atlas.materialAt(sid,exam);if(!row||!key||key.split('|')[1]!==row.exam)return [];
 return atlas.questionsFor(row,key.split('|')[0]).map(q=>{const rate=valid(q.max)&&q.max>0&&valid(q.score)?q.score/q.max:null,normal=valid(rate)&&rate>=0&&rate<=1;return {...q,rate,normal,weak:normal&&rate<(atlas.data.rules?.focusRate??.75),knowledge:q.knowledge||'知识点未标注'};});
}
export function draftForPlan(atlas,context={},existing=null){
 const legacy=!!existing&&!existing.training?.questions?.length&&!existing.training?.goal&&(!existing.training?.key||existing.training?.count===undefined||existing.training?.targetRate===undefined);
 const plan=existing?normalizePlan(structuredClone(existing)):normalizePlan({sid:context.sid||'',exam:context.exam||atlas.latest,tier:context.tier||'under',status:'new',note:'',subject:context.subject||'',training:{tasks:['same','correction'],method:'individual',count:5,targetRate:80},schedule:{duration:10}});
 plan.training={count:5,targetRate:80,method:'individual',...plan.training,tasks:existing&&!Array.isArray(existing.training?.tasks)?['same','correction']:plan.training.tasks};plan.schedule={duration:10,...plan.schedule};
 const row=atlas.materialAt(plan.sid,plan.exam),answers=row?(atlas.personAnswers.get(row.sid+'|'+row.exam)||[]).filter(a=>a.classNo===row.classNo):[],available=answers.map(a=>a.subject+'|'+a.exam);
 plan.classNo=row?.classNo||context.no||atlas.classes[0]||null;
 const key=existing&&plan.training.key&&plan.training.key.split('|')[1]===plan.exam&&!available.includes(plan.training.key)?plan.training.key:available.includes(context.key)?context.key:available.includes(plan.training.key)?plan.training.key:available.find(k=>k.split('|')[0]===plan.subject)||available[0]||'';
 plan.training.key=key;plan.subject=key?key.split('|')[0]:plan.subject;
 if(!existing||legacy){if(legacy&&!plan.training.tasks.length)plan.training.tasks=['same','correction'];const qs=questionOptions(atlas,{...plan,key});plan.training.questions=qs.filter(q=>context.question!==undefined?q.index===Number(context.question):q.weak).sort((a,b)=>a.rate-b.rate).slice(0,context.question!==undefined?1:3).map(snapshotQuestion);}
 plan.teacher=plan.teacher||atlas.teacher(plan.classNo,plan.subject)||atlas.profile(plan.classNo).lead||'';
 return plan;
}
export const snapshotQuestion=q=>({label:q.label,index:q.index,knowledge:q.knowledge,max:q.max,score:q.score,rate:q.rate});
export function trainingSummary(plan){const t=plan.training||{},qs=t.questions||[],tasks=(t.tasks||[]).map(id=>trainingTasks.find(([key])=>id===key)?.[1]).filter(Boolean);return [qs.length?'第'+qs.map(q=>q.label).join('、')+'题':t.goal?'专项训练':'题目待选择',t.goal?'重点：'+t.goal:'',...new Set(qs.flatMap(q=>(q.knowledge||'').split(/[,，;；]/).map(s=>s.trim()).filter(Boolean))),tasks.join('、')||'任务待设置'].filter(Boolean).join(' · ');}
export function selectedPlans(plans,state={},atlas){const query=(state.planSearch||'').trim();return plans.filter(p=>(!state.planClass||state.planClass==='all'||Number(p.classNo)===Number(state.planClass))&&(!state.planStatus||state.planStatus==='all'||p.status===state.planStatus)&&planMatchesTime(p,state.planTiming)&&(!query||[atlas?.name(p.sid),p.subject,p.note,trainingSummary(p)].some(v=>String(v||'').includes(query))));}

export function materialPeople(atlas,exam){return [...new Set([...atlas.rows(exam),...atlas.data.answers.filter(a=>a.exam===exam)].map(r=>r.sid))].map(sid=>atlas.materialAt(sid,exam)).filter(Boolean).sort((a,b)=>a.classNo-b.classNo||atlas.name(a.sid).localeCompare(atlas.name(b.sid),'zh-CN'));}
