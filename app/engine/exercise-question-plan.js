import {exerciseQuestionTypes,exercisePlanFor} from './exercise-contract.js';

// A row without a type remains automatic. Count changes retain the existing
// prefix; new questions never inherit a neighbour's explicit choice.
export function resizeExercisePlan(request,count=request.count){
 const old=Array.isArray(request.questionPlan)?request.questionPlan:request.questionTypes?.length?exercisePlanFor(request):[];
 return Array.from({length:count},(_,i)=>({id:i+1,...(exerciseQuestionTypes(request.subject).includes(old[i]?.type)?{type:old[i].type}:{})}));
}
export function setExerciseQuestionType(request,index,type){
 if(!Number.isInteger(index)||index<0||index>=request.count||type!=='auto'&&!exerciseQuestionTypes(request.subject).includes(type))throw new Error('请选择当前学科支持的题型');
 const plan=resizeExercisePlan(request);plan[index]=type==='auto'?{id:index+1}:{id:index+1,type};
 return {...request,questionTypes:[],questionPlan:plan};
}
export function exercisePlanRows(request){return exercisePlanFor(request).map((slot,i)=>({...slot,explicit:!!request.questionPlan?.[i]?.type||!request.questionPlan&&!!slot.type}));}
export const exerciseExplicitTypeCount=request=>exercisePlanRows(request).filter(s=>s.explicit).length;
