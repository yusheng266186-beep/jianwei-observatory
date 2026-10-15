import {validateExerciseDiagram,exerciseDiagramSchema} from './exercise-diagrams.mjs';
// Shared browser/server boundary. Student identity never belongs in this request.
export const EXERCISE_VERSION=1;
export const EXERCISE_SUBJECTS=[
 {id:'语文',hint:'阅读理解、语言运用与表达',rule:'阅读题须完整提供原创材料和作答依据，不伪造作者、出处或原文；开放题列出可接受答案和分点评分依据。语言运用题语境充分，写作题明确文体、字数和任务。'},
 {id:'数学',hint:'概念、方法与推理应用',rule:'检查定义域、参数范围、符号、边界和答案唯一性；计算与推导完整，不超出教师确认的教学范围。'},
 {id:'英语',hint:'词汇语法、阅读与写作',rule:'阅读、完形和语境题完整提供英文材料；语言与高中教材范围匹配，单选无歧义，写作给出参考表达与分点评分标准。'},
 {id:'日语',hint:'语言知识、阅读与表达',rule:'完整提供日文语境或阅读材料，使用规范日语和明确的助词、词形及语法依据；开放表达给出参考答案与可接受变体。'},
 {id:'物理',hint:'模型、实验与定量分析',rule:'明确物理情境、研究对象、已知量、单位、必要常量及近似条件；检查量纲、符号和实验可行性。用文字和数据完整给定必要图示信息。'},
 {id:'历史',hint:'史料阅读与历史解释',rule:'史实、时序、概念准确；自拟材料须注明自拟，不捏造历史引文和出处；答案以材料和史实为据，开放题给出论证和评分依据。'},
 {id:'化学',hint:'概念、反应与实验探究',rule:'检查化学式、方程式配平、电荷守恒、反应条件、实验步骤及单位；明确必要数据，不把未给出的条件当作已知。'},
 {id:'生物',hint:'概念、遗传与实验设计',rule:'术语与高中教材一致，遗传和概率条件充分，实验须说明变量、对照和可支持的结论，不把推测表述为已证实事实。'},
 {id:'政治',hint:'概念辨析与材料论证',rule:'使用明确的教材概念和完整自拟情境，材料分析题给出观点、材料对应和论证步骤；不编造政策文件、法律条文或实时事实。'},
 {id:'地理',hint:'区域、过程与综合分析',rule:'区域位置、时间、尺度和数据明确；必要地图改用完整坐标、表格或文字描述，解释过程与因果联系，不依赖未提供的图片。'}
];
export const EXERCISE_DIFFICULTIES=[
 {id:'基础起步',hint:'识记理解 · 单一考点',rule:'以概念辨认、直接理解和单步应用为主，不设置跨知识点的迁移题。',required:['基础','巩固']},
 {id:'基础巩固',hint:'常规应用 · 方法熟练',rule:'以教材常规设问和一至两步应用为主，先基础后巩固，少量直接迁移。',required:['基础','巩固']},
 {id:'方法进阶',hint:'多步分析 · 方法选择',rule:'以两至三步分析和方法选择为主，用少量基础题铺垫，再检验同类情境迁移。',required:['巩固']},
 {id:'综合提升',hint:'知识联系 · 情境迁移',rule:'突出已学知识之间的联系、材料分析和多步推理，包含巩固与迁移，避免仅堆叠计算量。',required:['巩固','迁移']},
 {id:'拓展挑战',hint:'复杂情境 · 深度推理',rule:'以陌生但条件充分的高中课程情境和深度推理为主，至少一半为迁移题，不使用大学或竞赛知识。',required:['迁移']}
];
export const difficultyProfile=id=>EXERCISE_DIFFICULTIES.find(d=>d.id===(id==='适度提升'?'方法进阶':id));
export function exerciseSubjects(atlas,{sid,exam}={}){
 const row=atlas.materialAt(sid,exam);if(!row)return [];
 const answers=(atlas.personAnswers?.get(sid+'|'+exam)||[]).filter(a=>a.classNo===undefined||a.classNo===row.classNo),known=new Set([...Object.keys(row.subjects||{}),...answers.map(a=>a.subject)]);
 return EXERCISE_SUBJECTS.filter(s=>known.has(s.id)).map(s=>s.id);
}
export function parseExerciseJSON(source){
 // Repair only JSON escaping, never rename fields, invent answers, or complete text.
 let text='',quoted=false;
 for(let i=0;i<source.length;i++){const ch=source[i];if(ch==='"'){quoted=!quoted;text+=ch;continue;}if(quoted&&ch==='\\'){const next=source[i+1];if(next==='\\'||next==='"'||next==='/'){text+=ch+next;i++;continue;}const command=source.slice(i+1).match(/^[A-Za-z]+/)?.[0];if(!/[bfnrtu]/.test(next||'')||command?.length>1&&!command.startsWith('u'))text+='\\';text+=ch;continue;}text+=ch;}
 const normalize=value=>typeof value==='string'?value.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g).map((part,i)=>i%2?part:part.replace(/\\n/g,'\n').replace(/\\r/g,'\r').replace(/\\t/g,'\t')).join(''):Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v)])):value;
 return normalize(JSON.parse(text));
}
const levels=['基础','巩固','迁移'],types=['填空','选择','多选','解答','简答','阅读','写作','实验','计算','翻译'];
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const keys=(o,allowed)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>allowed.includes(k));
export function validateExerciseRequest(value){
 if(!keys(value,['subject','grade','curriculum','focus','count','minutes','difficulty','evidence','basis','visuals','template'])||!EXERCISE_SUBJECTS.some(s=>s.id===value.subject)||value.grade!=='高三'||!text(value.curriculum,160)||!text(value.focus,500)||!Number.isInteger(value.count)||value.count<3||value.count>12||!Number.isInteger(value.minutes)||value.minutes<5||value.minutes>90||!difficultyProfile(value.difficulty)||!Array.isArray(value.evidence)||value.evidence.length>24)throw new Error('请确认学科、训练重点、教材范围、3–12题及5–90分钟。');
 for(const e of value.evidence)if(!keys(e,['label','knowledge','score','max','exam'])||!text(e.label,60)||typeof e.knowledge!=='string'||e.knowledge.length>200||typeof e.score!=='number'||!Number.isFinite(e.score)||typeof e.max!=='number'||!Number.isFinite(e.max)||e.max<=0||e.score<0||e.score>e.max)throw new Error('训练依据只接受明确满分、有效得分的匿名得分项。');
 if(value.evidence.some(e=>e.exam!==undefined&&(!Number.isInteger(e.exam)||e.exam<1||e.exam>6)))throw new Error('考试依据编号无效。');
 if(value.visuals!==undefined&&!['vector','hybrid','none'].includes(value.visuals))throw new Error('图示策略无效。');
 if(value.template!==undefined&&!['targeted','variation','retest'].includes(value.template))throw new Error('训练模板无效。');
 if(value.basis!==undefined){const b=value.basis;if(!keys(b,['mode','examCount','weakPoints'])||!['latest','common','manual'].includes(b.mode)||!Number.isInteger(b.examCount)||b.examCount<0||b.examCount>6||!Array.isArray(b.weakPoints)||b.weakPoints.length>10)throw new Error('考试分析范围无效。');for(const g of b.weakPoints)if(!keys(g,['knowledge','examCount','score','max','items'])||!text(g.knowledge,200)||!Number.isInteger(g.examCount)||g.examCount<1||g.examCount>b.examCount||!Number.isInteger(g.items)||g.items<1||!Number.isFinite(g.score)||!Number.isFinite(g.max)||g.max<=0||g.score<0||g.score>=g.max)throw new Error('共性薄弱点依据无效。');if(b.mode==='common'&&(b.examCount<2||!b.weakPoints.length||b.weakPoints.some(g=>g.examCount<2)))throw new Error('至少选择两次有共同知识点失分的考试。');}
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
  if(!keys(q,['id','level','type','stem','choices','answer','analysis','points','maxScore','minutes','diagram'])||q.id!==i+1||!levels.includes(q.level)||!types.includes(q.type)||!text(q.stem,3000)||!text(q.answer,2000)||!text(q.analysis,4000)||!Array.isArray(q.choices)||!Array.isArray(q.points)||!q.points.length||q.points.length>8||q.points.some(p=>!text(p,300))||!Number.isInteger(q.maxScore)||q.maxScore<1||q.maxScore>25||!Number.isInteger(q.minutes)||q.minutes<1||q.minutes>30)throw new Error('第'+(i+1)+'题的题干、答案、解析或评分点不完整。');
  if(q.diagram)q.diagram=validateExerciseDiagram(q.diagram);
  const choice=['选择','多选'].includes(q.type);
  if(choice&&(q.choices.length!==4||q.choices.some(c=>!text(c,1000))||new Set(q.choices).size!==4||!(q.type==='选择'?/^[ABCD]$/:/^(?:AB|AC|AD|BC|BD|CD|ABC|ABD|ACD|BCD|ABCD)$/).test(q.answer)))throw new Error('第'+(i+1)+'题的选项或答案不符合题型要求。');
  if(!choice&&q.choices.length)throw new Error('非选择题不能附带选项。');
  const stem=q.stem.replace(/\s/g,'');if(stems.has(stem))throw new Error('练习中存在重复题目。');stems.add(stem);
  // HTML and scripts are never accepted as model-authored layout.
  if([q.stem,q.answer,q.analysis,...q.choices,...q.points].some(s=>/<\/?(?:script|iframe|img|svg|style)\b|javascript:/i.test(s)))throw new Error('题目中存在非教学内容。');
 }
 const profile=difficultyProfile(request.difficulty),required=request.difficulty==='适度提升'?['基础','巩固']:profile.required;
 if(required.some(level=>!value.questions.some(q=>q.level===level)))throw new Error('题目梯度与所选难度不匹配。');
 if(request.difficulty==='基础起步'&&value.questions.some(q=>q.level==='迁移'))throw new Error('基础起步练习不应包含迁移题。');
 if(request.difficulty==='拓展挑战'&&value.questions.filter(q=>q.level==='迁移').length<Math.ceil(request.count/2))throw new Error('拓展挑战练习应以迁移题为主。');
 const minutes=value.questions.reduce((n,q)=>n+q.minutes,0);if(minutes>request.minutes*1.5||minutes<request.minutes*.5)throw new Error('题目预计用时与训练时长不匹配。');
 return structuredClone(value);
}
export function exerciseEvidence(atlas,{sid,exam,plan,subject='数学'}={}){
 const row=atlas.materialAt(sid,exam);if(!row)return [];
 const selected=plan?.training?.key===subject+'|'+exam?plan.training.questions||[]:[];
 const questions=selected.length?selected:atlas.questionsFor(row,subject);
 return questions.filter(q=>typeof q.score==='number'&&Number.isFinite(q.score)&&typeof q.max==='number'&&Number.isFinite(q.max)&&q.max>0&&q.score>=0&&q.score<=q.max&&q.score<q.max).sort((a,b)=>a.score/a.max-b.score/b.max).slice(0,12).map(q=>({label:String(q.label),knowledge:String(q.knowledge||'').replace(/^知识点未标注$/,''),score:q.score,max:q.max}));
}
export const exerciseSchema={type:'object',additionalProperties:false,required:['title','objective','questions'],properties:{title:{type:'string'},objective:{type:'string'},questions:{type:'array',items:{type:'object',additionalProperties:false,required:['id','level','type','stem','choices','answer','analysis','points','maxScore','minutes'],properties:{id:{type:'integer'},level:{type:'string',enum:levels},type:{type:'string',enum:types},stem:{type:'string'},choices:{type:'array',items:{type:'string'}},answer:{type:'string'},analysis:{type:'string'},points:{type:'array',items:{type:'string'}},maxScore:{type:'integer'},minutes:{type:'integer'},diagram:exerciseDiagramSchema}}}}};
