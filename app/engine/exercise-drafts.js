import {exerciseQuestionTypes} from './exercise-contract.js';

export const exerciseDraftKey=({sid,exam},subject)=>JSON.stringify([sid,exam,subject]);
const focusKey=(key,{mode='latest',exams=[]})=>JSON.stringify([key,mode,mode==='common'?[...new Set(exams)].sort():[]]);
export function createExerciseDrafts({limit=60}={}){
 const requests=new Map(),focuses=new Map(),applied=new Set();
 const put=(map,key,value)=>{map.delete(key);map.set(key,structuredClone(value));while(map.size>limit)map.delete(map.keys().next().value);};
 return {get:key=>requests.has(key)?structuredClone(requests.get(key)):null,set:(key,value)=>put(requests,key,value),delete:key=>{applied.delete(key);return requests.delete(key);},markApplied:(key,value)=>value?applied.add(key):applied.delete(key),isApplied:key=>applied.has(key),saveFocus:(key,basis,focus)=>put(focuses,focusKey(key,basis),focus),focus:(key,basis,fallback)=>focuses.has(focusKey(key,basis))?focuses.get(focusKey(key,basis)):fallback,
  serialize:()=>structuredClone({version:1,requests:[...requests],focuses:[...focuses],applied:[...applied].filter(key=>requests.has(key))}),
  restore(saved){requests.clear();focuses.clear();applied.clear();if(saved?.version!==1)return;for(const pair of (Array.isArray(saved.requests)?saved.requests:[]))if(Array.isArray(pair)&&typeof pair[0]==='string'&&pair[1]&&typeof pair[1]==='object'&&!Array.isArray(pair[1]))put(requests,pair[0],pair[1]);for(const pair of (Array.isArray(saved.focuses)?saved.focuses:[]))if(Array.isArray(pair)&&typeof pair[0]==='string'&&typeof pair[1]==='string')put(focuses,pair[0],pair[1]);for(const key of Array.isArray(saved.applied)?saved.applied:[])if(requests.has(key))applied.add(key);},
  clear(){requests.clear();focuses.clear();applied.clear();}};
}
// Saved sheets retain their historical contract. A newly started exercise uses
// today's subject choices, including when it begins from an older task.
export function newExerciseDraft(request){const draft=structuredClone(request);draft.examStyle='sichuan-gaokao';draft.answerSpaceVersion=1;draft.visuals??='auto';if(draft.questionTypes)draft.questionTypes=draft.questionTypes.filter(type=>exerciseQuestionTypes(draft.subject).includes(type));return draft;}
// Each page commits only students it edited; unrelated drafts in other tabs
// remain intact. A null request removes the submitted draft, not the library.
export function mergeExerciseComposer(saved,changes,{limit=60}={}){
 const source=saved?.version===1?saved:{},pairs=value=>Array.isArray(value)?value.filter(p=>Array.isArray(p)&&typeof p[0]==='string'):[],requests=new Map(pairs(source.requests)),focuses=new Map(pairs(source.focuses)),bases=new Map(pairs(source.bases)),applied=new Set(Array.isArray(source.applied)?source.applied:[]);
 for(const [key,value] of changes){requests.delete(key);if(!value.request){applied.delete(key);bases.delete(key);continue;}requests.set(key,structuredClone(value.request));bases.set(key,structuredClone(value.basis));value.applied?applied.add(key):applied.delete(key);for(const [focusKey,focus] of value.focuses||[]){focuses.delete(focusKey);focuses.set(focusKey,focus);}}
 while(requests.size>limit)requests.delete(requests.keys().next().value);while(focuses.size>limit)focuses.delete(focuses.keys().next().value);
 return {version:1,requests:[...requests],focuses:[...focuses],bases:[...bases].filter(([key])=>requests.has(key)),applied:[...applied].filter(key=>requests.has(key))};
}
