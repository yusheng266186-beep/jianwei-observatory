// Shared browser/server boundary. Student identity never belongs in this request.
export const EXERCISE_VERSION=1;
export function parseExerciseJSON(source){
 // Repair only JSON escaping, never rename fields, invent answers, or complete text.
 let text='',quoted=false;
 for(let i=0;i<source.length;i++){const ch=source[i];if(ch==='"'){quoted=!quoted;text+=ch;continue;}if(quoted&&ch==='\\'){const next=source[i+1];if(next==='\\'||next==='"'||next==='/'){text+=ch+next;i++;continue;}const command=source.slice(i+1).match(/^[A-Za-z]+/)?.[0];if(!/[bfnrtu]/.test(next||'')||command?.length>1&&!command.startsWith('u'))text+='\\';text+=ch;continue;}text+=ch;}
 const normalize=value=>typeof value==='string'?value.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g).map((part,i)=>i%2?part:part.replace(/\\n/g,'\n').replace(/\\r/g,'\r').replace(/\\t/g,'\t')).join(''):Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v)])):value;
 return normalize(JSON.parse(text));
}
const levels=['基础','巩固','迁移'],types=['填空','选择','解答'];
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const keys=(o,allowed)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>allowed.includes(k));
export function validateExerciseRequest(value){
 if(!keys(value,['subject','grade','curriculum','focus','count','minutes','difficulty','evidence'])||value.subject!=='数学'||value.grade!=='高三'||!text(value.curriculum,160)||!text(value.focus,500)||!Number.isInteger(value.count)||value.count<3||value.count>8||!Number.isInteger(value.minutes)||value.minutes<5||value.minutes>60||!['基础巩固','适度提升'].includes(value.difficulty)||!Array.isArray(value.evidence)||value.evidence.length>12)throw new Error('请填写数学训练重点、教材范围、3–8题及5–60分钟。');
 for(const e of value.evidence)if(!keys(e,['label','knowledge','score','max'])||!text(e.label,60)||typeof e.knowledge!=='string'||e.knowledge.length>200||typeof e.score!=='number'||!Number.isFinite(e.score)||typeof e.max!=='number'||!Number.isFinite(e.max)||e.max<=0||e.score<0||e.score>e.max)throw new Error('训练依据只接受明确满分、有效得分的匿名得分项。');
 return structuredClone(value);
}
export function validateExerciseResult(value,request){
 validateExerciseRequest(request);
 value=structuredClone(value);
 // Pure formula choices occasionally lack delimiters. Add layout markers only;
 // do not change the expression or infer missing mathematical content.
 if(Array.isArray(value?.questions))for(const q of value.questions)if(Array.isArray(q?.choices))q.choices=q.choices.map(c=>typeof c==='string'&&!c.includes('$')&&/\\[A-Za-z]+/.test(c)&&/^[\x20-\x7e]+$/.test(c)?'$'+c+'$':c);
 if(!keys(value,['title','objective','questions'])||!text(value.title,100)||!text(value.objective,500)||!Array.isArray(value.questions)||value.questions.length!==request.count)throw new Error('题目数量或训练目标不完整。');
 const stems=new Set();
 for(const [i,q] of value.questions.entries()){
  if(!keys(q,['id','level','type','stem','choices','answer','analysis','points','maxScore','minutes'])||q.id!==i+1||!levels.includes(q.level)||!types.includes(q.type)||!text(q.stem,3000)||!text(q.answer,2000)||!text(q.analysis,4000)||!Array.isArray(q.choices)||!Array.isArray(q.points)||!q.points.length||q.points.length>8||q.points.some(p=>!text(p,300))||!Number.isInteger(q.maxScore)||q.maxScore<1||q.maxScore>25||!Number.isInteger(q.minutes)||q.minutes<1||q.minutes>30)throw new Error('第'+(i+1)+'题的题干、答案、解析或评分点不完整。');
  if(q.type==='选择'&&(q.choices.length!==4||q.choices.some(c=>!text(c,1000))||new Set(q.choices).size!==4||!/^[ABCD]$/.test(q.answer)))throw new Error('第'+(i+1)+'题的选项或唯一答案不符合要求。');
  if(q.type!=='选择'&&q.choices.length)throw new Error('非选择题不能附带选项。');
  const stem=q.stem.replace(/\s/g,'');if(stems.has(stem))throw new Error('练习中存在重复题目。');stems.add(stem);
  // HTML and scripts are never accepted as model-authored layout.
  if([q.stem,q.answer,q.analysis,...q.choices,...q.points].some(s=>/<\/?(?:script|iframe|img|svg|style)\b|javascript:/i.test(s)))throw new Error('题目中存在非教学内容。');
 }
 if(!value.questions.some(q=>q.level==='基础')||!value.questions.some(q=>q.level==='巩固'))throw new Error('练习须包含基础与巩固梯度。');
 const minutes=value.questions.reduce((n,q)=>n+q.minutes,0);if(minutes>request.minutes*1.5||minutes<request.minutes*.5)throw new Error('题目预计用时与训练时长不匹配。');
 return structuredClone(value);
}
export function exerciseEvidence(atlas,{sid,exam,plan}={}){
 const row=atlas.materialAt(sid,exam);if(!row)return [];
 const selected=plan?.training?.key==='数学|'+exam?plan.training.questions||[]:[];
 const questions=selected.length?selected:atlas.questionsFor(row,'数学');
 return questions.filter(q=>typeof q.score==='number'&&Number.isFinite(q.score)&&typeof q.max==='number'&&Number.isFinite(q.max)&&q.max>0&&q.score>=0&&q.score<=q.max&&q.score<q.max).sort((a,b)=>a.score/a.max-b.score/b.max).slice(0,12).map(q=>({label:String(q.label),knowledge:String(q.knowledge||'').replace(/^知识点未标注$/,''),score:q.score,max:q.max}));
}
export const exerciseSchema={type:'object',additionalProperties:false,required:['title','objective','questions'],properties:{title:{type:'string'},objective:{type:'string'},questions:{type:'array',items:{type:'object',additionalProperties:false,required:['id','level','type','stem','choices','answer','analysis','points','maxScore','minutes'],properties:{id:{type:'integer'},level:{type:'string',enum:levels},type:{type:'string',enum:types},stem:{type:'string'},choices:{type:'array',items:{type:'string'}},answer:{type:'string'},analysis:{type:'string'},points:{type:'array',items:{type:'string'}},maxScore:{type:'integer'},minutes:{type:'integer'}}}}}};
