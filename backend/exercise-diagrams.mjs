import {validateExerciseModel,exerciseModelSchema} from './exercise-models.mjs';
import {validateExerciseScene,exerciseSceneSchema} from './exercise-scene.mjs';
import {validateScienceFigure,scienceFigureSchema} from './exercise-science.mjs';
const kinds=['plot','geometry','forces','circuit','apparatus','flow','bars','illustration','drawing','science','scatter'];
export const exerciseEquipment=['gas-bottle','round-flask','conical-flask','three-neck-flask','beaker'];
// A single generated illustration is bounded here; the whole document keeps a
// separate combined budget in exercise-contract.js.
export const EXERCISE_IMAGE_MAX_CHARS=4000000;
// Comparisons and chemical flow arrows are teaching text. The renderer escapes
// every label; reject markup without treating "a -> b" or "x < 0" as HTML.
const text=(s,n)=>typeof s==='string'&&s.length<=n&&!/<\s*\/?\s*[a-z!][^>]*>|javascript:/i.test(s);
const keys=(v,allowed)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>allowed.includes(k));
export function validateExerciseDiagram(d){
 if(!keys(d,['kind','caption','description','xLabel','yLabel','xRange','yRange','series','nodes','edges','image','model','scene','spec'])||!kinds.includes(d.kind)||!text(d.caption,160)||!text(d.description,1600))throw new Error('图示类型、说明或字段不完整。');
 if(d.kind==='science'){if(Object.keys(d).some(k=>!['kind','caption','description','spec'].includes(k)))throw new Error('学科结构图不能混入其他图形字段。');validateScienceFigure(d.spec);return structuredClone(d);}
 if(d.spec!==undefined)throw new Error('结构数据须用于学科图示。');
 if(d.kind==='drawing'){if(Object.keys(d).some(k=>!['kind','caption','description','scene'].includes(k)))throw new Error('定制矢量图不能混入其他图形数据。');validateExerciseScene(d.scene);return structuredClone(d);}
 if(d.scene!==undefined)throw new Error('绘图元素须用于定制矢量图。');
 if(d.model){validateExerciseModel(d);return structuredClone(d);}
 if(d.kind==='illustration'){
  if(Object.hasOwn(d,'image')&&(!keys(d.image,['mime','data'])||!['image/png','image/jpeg'].includes(d.image.mime)||typeof d.image.data!=='string'||d.image.data.length>EXERCISE_IMAGE_MAX_CHARS||!(/^[A-Za-z0-9+/=]+$/.test(d.image.data))))throw new Error('插图文件无效。');
  if(d.image){let raw;try{raw=atob(d.image.data);}catch{throw new Error('插图编码无效。');}if(d.image.mime==='image/jpeg'){if(raw.charCodeAt(0)!==255||raw.charCodeAt(1)!==216||raw.charCodeAt(2)!==255)throw new Error('插图编码无效。');return structuredClone(d);}const size=offset=>((raw.charCodeAt(offset)*16777216)+(raw.charCodeAt(offset+1)<<16)+(raw.charCodeAt(offset+2)<<8)+raw.charCodeAt(offset+3));if(raw.length<33||raw.slice(12,16)!=='IHDR'||size(16)<64||size(20)<64||size(16)>4096||size(20)>4096)throw new Error('插图尺寸无效。');}
  return structuredClone(d);
 }
 if(d.image)throw new Error('标准图示应使用矢量数据。');
 if(['plot','bars','scatter'].includes(d.kind)){
  for(const key of ['xRange','yRange'])if(!Array.isArray(d[key])||d[key].length!==2||d[key].some(x=>!Number.isFinite(x)||Math.abs(x)>1e6)||d[key][0]>=d[key][1])throw new Error('坐标范围无效。');
  if(!text(d.xLabel,40)||!text(d.yLabel,40)||!Array.isArray(d.series)||!d.series.length||d.series.length>4)throw new Error('坐标名称或数据组无效。');
  if(d.kind==='bars'&&(d.yRange[0]>0||d.yRange[1]<0||d.series.some(s=>new Set(s.points.map(p=>p[0])).size!==s.points.length)))throw new Error('柱状图纵轴须包含0，同组横坐标不可重复。');
  for(const s of d.series)if(!keys(s,['label','points'])||!text(s.label,50)||!Array.isArray(s.points)||s.points.length<2||s.points.length>160||s.points.some(p=>!Array.isArray(p)||p.length!==2||p.some((n,i)=>!Number.isFinite(n)||n<d[i===0?'xRange':'yRange'][0]||n>d[i===0?'xRange':'yRange'][1])))throw new Error('图像数据超出坐标范围。');
 }else{
  if(!Array.isArray(d.nodes)||!d.nodes.length||d.nodes.length>18||!Array.isArray(d.edges)||d.edges.length>32)throw new Error('模型节点或连线数量无效。');
  const ids=new Set();for(const n of d.nodes){if(!keys(n,['id','x','y','label','shape','equipment','liquidLevel','inlet','outlet','additionFunnel'])||!text(n.id,20)||!n.id||ids.has(n.id)||![n.x,n.y].every(v=>Number.isFinite(v)&&v>=12&&v<=88)||!text(n.label,18)||!['point','block','circle','vessel','junction'].includes(n.shape))throw new Error('图示节点无效。');ids.add(n.id);
   if(n.equipment!==undefined){if(d.kind!=='apparatus'||n.shape!=='vessel'||!exerciseEquipment.includes(n.equipment)||!Number.isFinite(n.liquidLevel)||n.liquidLevel<0||n.liquidLevel>70||!['none','short','long','funnel'].includes(n.inlet)||!['none','short','long'].includes(n.outlet)||n.y<28||n.y>68)throw new Error('实验仪器、液位或导管参数不完整。');if(n.liquidLevel<20&&[n.inlet,n.outlet].includes('long'))throw new Error('浸入液面的导管需要足够液位。');}
   else if(['liquidLevel','inlet','outlet','additionFunnel'].some(k=>Object.hasOwn(n,k)))throw new Error('导管参数须对应具体仪器。');
  }
  for(const n of d.nodes){if(n.inlet==='funnel'&&(n.equipment!=='beaker'||n.outlet!=='none'||n.liquidLevel<20))throw new Error('倒置漏斗须对应盛液烧杯，末端吸收装置不另接出气管。');if(n.additionFunnel!==undefined&&typeof n.additionFunnel!=='boolean'||n.additionFunnel&&(!['round-flask','conical-flask'].includes(n.equipment)||n.inlet!=='none'))throw new Error('分液漏斗须接入发生烧瓶，不能与同一进气口重复占用。');}
  const detailed=d.nodes.some(n=>n.equipment);if(detailed&&d.nodes.some(n=>!n.equipment))throw new Error('同一套实验装置须完整指定各个仪器。');
  if(detailed)for(const [i,a] of d.nodes.entries())for(const b of d.nodes.slice(i+1))if(Math.abs(a.x-b.x)<18&&Math.abs(a.y-b.y)<43)throw new Error('实验仪器之间间距不足。');
  for(const e of d.edges)if(typeof e?.label!=='string')throw new Error('每条连线必须包含from、to、label、type；label没有文字时也必须写成空字符串。');
  for(const e of d.edges)if(!keys(e,['from','to','label','type'])||!ids.has(e.from)||!ids.has(e.to)||e.from===e.to||!text(e.label,24)||!['line','arrow','dashed','resistor','battery','lamp','switch','tube'].includes(e.type))throw new Error('图示连线无效。');
  if(detailed){const inlet=new Set(),outlet=new Set();for(const e of d.edges){const a=d.nodes.find(n=>n.id===e.from),b=d.nodes.find(n=>n.id===e.to);if(e.type!=='tube'||a.outlet==='none'||b.inlet==='none'||inlet.has(b.id)||outlet.has(a.id)||b.x-a.x<18||Math.abs(a.y-b.y)>1)throw new Error('气路须从左向右连接出气口与进气口，不交叉或重复连接。');inlet.add(b.id);outlet.add(a.id);}}
  else if(d.edges.some(e=>e.type==='tube'))throw new Error('导气管须连接具体仪器。');
  for(const e of d.edges){const a=d.nodes.find(n=>n.id===e.from),b=d.nodes.find(n=>n.id===e.to);if(a.x===b.x&&a.y===b.y)throw new Error('连线端点不能重合。');}
 }
 return structuredClone(d);
}
// These are checks on new model output, not a migration of stored worksheets.
// Never infer missing apparatus or fabricate experimental curve coordinates.
export function validateGeneratedExerciseFigures(sheet,request,{allowRequests=false}={}){
 for(const q of sheet.questions){
  const d=q.diagram,studentText=[q.stem,...q.choices].join('\n');
  if(!d&&!(allowRequests&&q.figureRequest)&&/(?:如图所示|如下图|下图[为所是]|图中[的所甲乙丙丁ABCD]|见图|曲线[甲乙丙丁ⅠⅡⅢ])/u.test(studentText))throw new Error('第'+q.id+'题引用了未提供的图示。');
  if(!d)continue;validateExerciseDiagram(d);
  const labels=[d.xLabel,d.yLabel,...(d.series||[]).map(s=>s.label),...(d.nodes||[]).map(n=>n.label),...(d.edges||[]).map(e=>e.label)].filter(Boolean);
  if(labels.some(s=>/[$\\]/.test(s)))throw new Error('第'+q.id+'题的图中标签须使用可直接显示的文字。');
  if(d.model&&!['数学','物理'].includes(request.subject))throw new Error('第'+q.id+'题的标准模型不适用于当前学科。');
  if(d.kind==='science'){if(d.spec.family==='mechanics'&&d.spec.model==='conveyor'&&!Object.hasOwn(d.spec,'blockPosition'))throw new Error('第'+q.id+'题的传送带图须明确物块的初始位置blockPosition。');const subjects={conic:['数学'],optics:['物理'],'uniform-field':['物理'],pedigree:['生物'],'ocean-currents':['地理'],strata:['地理'],mechanics:['物理'],circuit:['物理'],molecule:['化学','生物'],'molecular-model':['化学','生物'],crystal:['化学'],cell:['生物'],photosynthesis:['生物'],dna:['生物'],terrain:['地理'],climate:['地理']};if(!subjects[d.spec.family].includes(request.subject))throw new Error('第'+q.id+'题的学科图示与当前科目不符。');}
  if(request.subject!=='化学')continue;
  if(d.kind==='apparatus'&&d.nodes.some(n=>!n.equipment))throw new Error('第'+q.id+'题的实验装置未指定具体仪器和导管。');
  if(d.kind==='flow'&&/(?:仪器名称|仪器的名称|长[进导管]|短[出导管]|插入液面|液面[上下]|三[颈口]烧瓶)/u.test(q.stem))throw new Error('第'+q.id+'题不能用流程框代替考查结构的实验装置。');
  if(d.kind==='plot')for(const s of d.series){if(s.label.length>14||s.points.some((p,i)=>i&&p[0]<s.points[i-1][0])||new Set(s.points.map(p=>p.join(','))).size<2)throw new Error('第'+q.id+'题的变化曲线标注或横坐标顺序不完整。');}
 }
 return sheet;
}
export const exerciseDiagramSchema={type:'object',additionalProperties:false,required:['kind','caption','description'],properties:{model:exerciseModelSchema,scene:exerciseSceneSchema,spec:scienceFigureSchema,kind:{type:'string',enum:kinds},caption:{type:'string'},description:{type:'string'},xLabel:{type:'string'},yLabel:{type:'string'},xRange:{type:'array',items:{type:'number'}},yRange:{type:'array',items:{type:'number'}},series:{type:'array',items:{type:'object',additionalProperties:false,required:['label','points'],properties:{label:{type:'string'},points:{type:'array',items:{type:'array',items:{type:'number'}}}}}},nodes:{type:'array',items:{type:'object',additionalProperties:false,required:['id','x','y','label','shape'],properties:{id:{type:'string'},x:{type:'number'},y:{type:'number'},label:{type:'string'},shape:{type:'string',enum:['point','block','circle','vessel','junction']},equipment:{type:'string',enum:exerciseEquipment},liquidLevel:{type:'number',minimum:0,maximum:70},inlet:{type:'string',enum:['none','short','long','funnel']},additionFunnel:{type:'boolean'},outlet:{type:'string',enum:['none','short','long']}}}},edges:{type:'array',items:{type:'object',additionalProperties:false,required:['from','to','label','type'],properties:{from:{type:'string'},to:{type:'string'},label:{type:'string'},type:{type:'string',enum:['line','arrow','dashed','resistor','battery','lamp','switch','tube']}}}}}};
