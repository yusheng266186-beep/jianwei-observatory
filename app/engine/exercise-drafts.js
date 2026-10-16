import {exerciseQuestionTypes} from './exercise-contract.js';

export const exerciseDraftKey=({sid,exam},subject)=>JSON.stringify([sid,exam,subject]);
const focusKey=(key,{mode='latest',exams=[]})=>JSON.stringify([key,mode,mode==='common'?[...new Set(exams)].sort():[]]);
export function createExerciseDrafts({limit=60}={}){
 const requests=new Map(),focuses=new Map();
 const put=(map,key,value)=>{map.delete(key);map.set(key,structuredClone(value));while(map.size>limit)map.delete(map.keys().next().value);};
 return {get:key=>requests.has(key)?structuredClone(requests.get(key)):null,set:(key,value)=>put(requests,key,value),delete:key=>requests.delete(key),saveFocus:(key,basis,focus)=>put(focuses,focusKey(key,basis),focus),focus:(key,basis,fallback)=>focuses.has(focusKey(key,basis))?focuses.get(focusKey(key,basis)):fallback,
  serialize:()=>structuredClone({version:1,requests:[...requests],focuses:[...focuses]}),
  restore(saved){requests.clear();focuses.clear();if(saved?.version!==1)return;for(const pair of (Array.isArray(saved.requests)?saved.requests:[]))if(Array.isArray(pair)&&typeof pair[0]==='string'&&pair[1]&&typeof pair[1]==='object'&&!Array.isArray(pair[1]))put(requests,pair[0],pair[1]);for(const pair of (Array.isArray(saved.focuses)?saved.focuses:[]))if(Array.isArray(pair)&&typeof pair[0]==='string'&&typeof pair[1]==='string')put(focuses,pair[0],pair[1]);},
  clear(){requests.clear();focuses.clear();}};
}
// Saved sheets retain their historical contract. A newly started exercise uses
// today's subject choices, including when it begins from an older task.
export function newExerciseDraft(request){const draft=structuredClone(request);draft.examStyle='sichuan-gaokao';if(draft.questionTypes)draft.questionTypes=draft.questionTypes.filter(type=>exerciseQuestionTypes(draft.subject).includes(type));return draft;}
