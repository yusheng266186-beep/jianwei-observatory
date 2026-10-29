import {exerciseQuestionTypes,exercisePlanFor} from './exercise-contract.js';

// A row without a type remains automatic. Count changes retain the existing
// prefix; new questions never inherit a neighbour's explicit choice.
export function resizeExercisePlan(request,count=request.count){
 const old=Array.isArray(request.questionPlan)?request.questionPlan:request.questionTypes?.length?exercisePlanFor(request):[];
 return Array.from({length:count},(_,i)=>({id:i+1,...(exerciseQuestionTypes(request.subject).includes(old[i]?.type)?{type:old[i].type}:{}),...(request.targetMode==='per-question'&&old[i]?.target?{target:old[i].target}:{})}));
}
export function setExerciseQuestionType(request,index,type){
 if(!Number.isInteger(index)||index<0||index>=request.count||type!=='auto'&&!exerciseQuestionTypes(request.subject).includes(type))throw new Error('请选择当前学科支持的题型');
 const plan=resizeExercisePlan(request);delete plan[index].type;if(type!=='auto')plan[index].type=type;
 return {...request,questionTypes:[],questionPlan:plan};
}
export function exercisePlanRows(request){return exercisePlanFor(request).map((slot,i)=>({...slot,explicit:!!request.questionPlan?.[i]?.type||!request.questionPlan&&!!slot.type}));}
export const exerciseExplicitTypeCount=request=>exercisePlanRows(request).filter(s=>s.explicit).length;

export function perQuestionExerciseRequest(request){
 if(request.targetMode==='per-question')return {...request,questionPlan:resizeExercisePlan(request)};
 const plan=exercisePlanFor(request).map(({id,type,target})=>({id,...(type?{type}:{}),...(target?{target}:{})}));
 return {...request,targetMode:'per-question',questionTypes:[],questionPlan:plan,focus:request.focus?.trim()?request.focus:'按每道题指定的知识点与题型安排专项练习。'};
}
export function exerciseTargetPool(before,plan){
 const assigned=new Set((before.questionPlan||[]).map(s=>s.target).filter(Boolean));
 return [...new Set([...(before.targets||[]).filter(t=>!assigned.has(t)),...plan.map(s=>s.target).filter(Boolean)])];
}
export function setExerciseQuestionTarget(request,index,target){
 if(!Number.isInteger(index)||index<0||index>=request.count||target!==undefined&&(typeof target!=='string'||!target.trim()||target.length>200))throw new Error('请选择有效的题目知识点');
 const input=perQuestionExerciseRequest(request),plan=resizeExercisePlan(input);delete plan[index].target;if(target)plan[index].target=target;
 return {...input,questionPlan:plan,targets:exerciseTargetPool(input,plan)};
}
