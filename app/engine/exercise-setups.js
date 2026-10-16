import {EXERCISE_SUBJECTS,difficultyProfile,exerciseQuestionTypes} from './exercise-contract.js';
const fields=['subject','curriculum','focus','targets','requirements','count','minutes','difficulty','questionTypes','visuals','template'];
// Reusable settings contain no student identity, exam IDs or score evidence.
export function exerciseSetupContent(request){
 if(!request||!EXERCISE_SUBJECTS.some(s=>s.id===request.subject))throw new Error('请选择训练学科');
 const content={};for(const field of fields)if(request[field]!==undefined)content[field]=structuredClone(request[field]);
 for(const [field,max] of [['curriculum',160],['focus',500],['requirements',1000]])if(content[field]!==undefined&&(typeof content[field]!=='string'||content[field].length>max))throw new Error('请精简'+({curriculum:'教学范围',focus:'训练重点',requirements:'补充要求'}[field])+'后保存');
 if(!Number.isInteger(content.count)||content.count<3||content.count>12||!Number.isInteger(content.minutes)||content.minutes<5||content.minutes>90||!difficultyProfile(content.difficulty))throw new Error('请确认题量、时长与难度后保存');
 for(const field of ['targets','questionTypes'])if(content[field]!==undefined&&(!Array.isArray(content[field])||content[field].some(v=>typeof v!=='string')||new Set(content[field]).size!==content[field].length))throw new Error('草稿选项无效');
 if(content.targets?.some(t=>!t.trim()||t.length>200)||content.questionTypes?.some(t=>!exerciseQuestionTypes(content.subject).includes(t)))throw new Error('请使用当前学科的训练选项');
 if(content.visuals!==undefined&&!['none','vector','hybrid'].includes(content.visuals)||content.template!==undefined&&!['targeted','variation','retest'].includes(content.template))throw new Error('草稿设置无效');
 return content;
}
export function savedExerciseSetups(value){return Array.isArray(value)?value.filter(row=>{try{return typeof row.id==='string'&&row.id.length<=80&&typeof row.name==='string'&&row.name.trim()&&row.name.length<=40&&Number.isFinite(row.updatedAt)&&!!exerciseSetupContent(row.content);}catch{return false;}}).map(row=>({...row,content:exerciseSetupContent(row.content)})):[];}
export function saveExerciseSetup(rows,request,{id,name,now=Date.now(),newId=()=>crypto.randomUUID()}={}){
 name=String(name||'').trim();if(!name||name.length>40)throw new Error('请输入1–40字的草稿名称');const content=exerciseSetupContent(request),existing=rows.find(r=>r.id===id);
 if(rows.some(r=>r.id!==existing?.id&&r.content.subject===content.subject&&r.name===name))throw new Error('同名草稿已存在，请更新原草稿或修改名称');
 const row={id:existing?.id||newId(),name,content,createdAt:existing?.createdAt||now,updatedAt:now};return {row,rows:[...rows.filter(r=>r.id!==row.id),row]};
}
export function applyExerciseSetup(setup,current){
 const content=exerciseSetupContent(setup.content);if(content.subject!==current.subject)throw new Error('请选择当前学科的草稿');
 const {targets,requirements,questionTypes,...base}=structuredClone(current);return {...base,...content,examStyle:'sichuan-gaokao'};
}
