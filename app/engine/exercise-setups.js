import {EXERCISE_SUBJECTS,difficultyProfile,exerciseQuestionTypes} from './exercise-contract.js';
const fields=['subject','curriculum','focus','targets','requirements','count','minutes','difficulty','questionTypes','questionPlan','targetMode','visuals','template'];
// Reusable settings contain no student identity, exam IDs or score evidence.
export function exerciseSetupContent(request){
 if(!request||!EXERCISE_SUBJECTS.some(s=>s.id===request.subject))throw new Error('请选择训练学科');
 const content={};for(const field of fields)if(request[field]!==undefined)content[field]=structuredClone(request[field]);
 for(const [field,max] of [['curriculum',160],['focus',2000],['requirements',1000]])if(content[field]!==undefined&&(typeof content[field]!=='string'||content[field].length>max))throw new Error('请精简'+({curriculum:'教学范围',focus:'训练重点',requirements:'补充要求'}[field])+'后保存');
 if(!Number.isInteger(content.count)||content.count<3||content.count>12||!Number.isInteger(content.minutes)||content.minutes<5||content.minutes>90||!difficultyProfile(content.difficulty))throw new Error('请确认题量、时长与难度后保存');
 for(const field of ['targets','questionTypes'])if(content[field]!==undefined&&(!Array.isArray(content[field])||content[field].some(v=>typeof v!=='string')||new Set(content[field]).size!==content[field].length))throw new Error('草稿选项无效');
 if(content.targets?.some(t=>!t.trim()||t.length>200)||content.questionTypes?.some(t=>!exerciseQuestionTypes(content.subject).includes(t)))throw new Error('请使用当前学科的训练选项');
 if(content.questionPlan!==undefined&&(!Array.isArray(content.questionPlan)||content.questionPlan.length!==content.count||content.questionPlan.some((s,i)=>!s||typeof s!=='object'||Object.keys(s).some(k=>!['id','type','target'].includes(k))||s.id!==i+1||s.type!==undefined&&!exerciseQuestionTypes(content.subject).includes(s.type)||s.target!==undefined&&(content.targetMode!=='per-question'||typeof s.target!=='string'||!s.target.trim()||s.target.length>200||!content.targets?.includes(s.target)))))throw new Error('逐题题型安排无效');
 if(content.targetMode!==undefined&&(content.targetMode!=='per-question'||!content.questionPlan||content.questionTypes?.length))throw new Error('逐题知识点安排无效');
 if(content.visuals!==undefined&&!['auto','none','vector','hybrid'].includes(content.visuals)||content.template!==undefined&&!['targeted','variation','retest'].includes(content.template))throw new Error('草稿设置无效');
 return content;
}
export function setupMetadata({tags=[],purpose='课后巩固'}={}){if(typeof tags==='string')tags=tags.split(/[,，;；、]/).map(s=>s.trim()).filter(Boolean);if(!Array.isArray(tags)||tags.length>6||tags.some(t=>typeof t!=='string'||!t.trim()||t.length>16))throw new Error('模板标签最多6个，每个不超过16字');if(!['课后巩固','课堂练习','考前复习','错题复测','分层辅导'].includes(purpose))throw new Error('请选择模板用途');return {tags:[...new Set(tags)],purpose};}
export function filterExerciseSetups(rows,{subject,query=''}={}){const terms=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);return rows.filter(r=>(!subject||r.content.subject===subject)&&terms.every(t=>[r.name,r.purpose,...(r.tags||[]),r.content.curriculum,r.content.focus].join(' ').toLocaleLowerCase().includes(t))).sort((a,b)=>b.updatedAt-a.updatedAt);}
export function savedExerciseSetups(value){return Array.isArray(value)?value.filter(row=>{try{return typeof row.id==='string'&&row.id.length<=80&&typeof row.name==='string'&&row.name.trim()&&row.name.length<=40&&Number.isFinite(row.updatedAt)&&!!exerciseSetupContent(row.content);}catch{return false;}}).map(row=>({id:row.id,name:row.name,createdAt:Number.isFinite(row.createdAt)?row.createdAt:row.updatedAt,updatedAt:row.updatedAt,content:exerciseSetupContent(row.content),...(()=>{try{return setupMetadata(row);}catch{return setupMetadata();}})(),...(typeof row.archiveSource==='string'&&row.archiveSource.length<=12000?{archiveSource:row.archiveSource}:{})})):[];}
export const exerciseSetupStamp=row=>row?JSON.stringify([row.id,row.name,row.updatedAt,exerciseSetupContent(row.content),row.tags||[],row.purpose||'课后巩固']):'';
function checkCurrent(rows,id,expected){const row=rows.find(r=>r.id===id);if(!row||expected&&exerciseSetupStamp(row)!==expected)throw Object.assign(new Error('这份草稿已在其他页面更新或删除，请重新选择后再修改。'),{code:'SETUP_STALE'});return row;}
export function saveExerciseSetup(rows,request,{id,name,expected,tags,purpose,now=Date.now(),newId=()=>crypto.randomUUID()}={}){
 name=String(name||'').trim();if(!name||name.length>40)throw new Error('请输入1–40字的草稿名称');const content=exerciseSetupContent(request),existing=id?checkCurrent(rows,id,expected):null;
 if(rows.some(r=>r.id!==existing?.id&&r.content.subject===content.subject&&r.name===name))throw new Error('同名草稿已存在，请更新原草稿或修改名称');
 const row={...existing,id:existing?.id||newId(),name,content,...setupMetadata({tags:tags??existing?.tags,purpose:purpose??existing?.purpose}),createdAt:existing?.createdAt??now,updatedAt:now};return {row,rows:[...rows.filter(r=>r.id!==row.id),row]};
}
export function renameExerciseSetup(rows,id,name,options={}){const row=checkCurrent(rows,id,options.expected);return saveExerciseSetup(rows,row.content,{...options,id,name});}
export function deleteExerciseSetup(rows,id,expected){checkCurrent(rows,id,expected);return rows.filter(r=>r.id!==id);}
export function restoreExerciseSetup(rows,row){if(rows.some(r=>r.id===row.id||r.name===row.name&&r.content.subject===row.content.subject))throw new Error('已有同名草稿，未覆盖现有内容。');return [...rows,row];}
export function mergeExerciseSetupArchive(current,incoming,{newId=()=>crypto.randomUUID()}={}){
 const rows=savedExerciseSetups(current);for(const source of savedExerciseSetups(incoming)){const signature=JSON.stringify([source.id,source.name,source.content,source.tags,source.purpose]),sameMetadata=r=>JSON.stringify([r.tags,r.purpose])===JSON.stringify([source.tags,source.purpose]);if(rows.some(r=>sameMetadata(r)&&(r.archiveSource===signature&&JSON.stringify(r.content)===JSON.stringify(source.content)||r.id===source.id&&r.name===source.name&&JSON.stringify(r.content)===JSON.stringify(source.content))))continue;
  let row=structuredClone(source);if(rows.some(r=>r.id===row.id||r.content.subject===row.content.subject&&r.name===row.name)){let index=2;do{row.name=source.name.slice(0,30)+'（导入'+index+++'）';}while(rows.some(r=>r.content.subject===row.content.subject&&r.name===row.name));row.id=newId();row.archiveSource=signature;}rows.push(row);
 }return rows;
}
export function applyExerciseSetup(setup,current){
 const content=exerciseSetupContent(setup.content);if(content.subject!==current.subject)throw new Error('请选择当前学科的草稿');
 const {targets,requirements,questionTypes,questionPlan,targetMode,...base}=structuredClone(current);return {...base,...content,examStyle:'sichuan-gaokao',answerSpaceVersion:1};
}
