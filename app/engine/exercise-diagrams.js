const kinds=['plot','geometry','forces','circuit','apparatus','flow','bars','illustration'];
// Comparisons and chemical flow arrows are teaching text. The renderer escapes
// every label; reject markup without treating "a -> b" or "x < 0" as HTML.
const text=(s,n)=>typeof s==='string'&&s.length<=n&&!/<\s*\/?\s*[a-z!][^>]*>|javascript:/i.test(s);
const keys=(v,allowed)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>allowed.includes(k));
export function validateExerciseDiagram(d){
 if(!keys(d,['kind','caption','description','xLabel','yLabel','xRange','yRange','series','nodes','edges','image'])||!kinds.includes(d.kind)||!text(d.caption,160)||!text(d.description,1600))throw new Error('图示类型、说明或字段不完整。');
 if(d.kind==='illustration'){
  if(Object.hasOwn(d,'image')&&(!keys(d.image,['mime','data'])||!['image/png','image/jpeg'].includes(d.image.mime)||typeof d.image.data!=='string'||d.image.data.length>4000000||!(/^[A-Za-z0-9+/=]+$/.test(d.image.data))))throw new Error('插图文件无效。');
  if(d.image){let raw;try{raw=atob(d.image.data);}catch{throw new Error('插图编码无效。');}if(d.image.mime==='image/jpeg'){if(raw.charCodeAt(0)!==255||raw.charCodeAt(1)!==216||raw.charCodeAt(2)!==255)throw new Error('插图编码无效。');return structuredClone(d);}const size=offset=>((raw.charCodeAt(offset)*16777216)+(raw.charCodeAt(offset+1)<<16)+(raw.charCodeAt(offset+2)<<8)+raw.charCodeAt(offset+3));if(raw.length<33||raw.slice(12,16)!=='IHDR'||size(16)<64||size(20)<64||size(16)>4096||size(20)>4096)throw new Error('插图尺寸无效。');}
  return structuredClone(d);
 }
 if(d.image)throw new Error('标准图示应使用矢量数据。');
 if(['plot','bars'].includes(d.kind)){
  for(const key of ['xRange','yRange'])if(!Array.isArray(d[key])||d[key].length!==2||d[key].some(x=>!Number.isFinite(x)||Math.abs(x)>1e6)||d[key][0]>=d[key][1])throw new Error('坐标范围无效。');
  if(!text(d.xLabel,40)||!text(d.yLabel,40)||!Array.isArray(d.series)||!d.series.length||d.series.length>4)throw new Error('坐标名称或数据组无效。');
  for(const s of d.series)if(!keys(s,['label','points'])||!text(s.label,50)||!Array.isArray(s.points)||s.points.length<2||s.points.length>160||s.points.some(p=>!Array.isArray(p)||p.length!==2||p.some((n,i)=>!Number.isFinite(n)||n<d[i===0?'xRange':'yRange'][0]||n>d[i===0?'xRange':'yRange'][1])))throw new Error('图像数据超出坐标范围。');
 }else{
  if(!Array.isArray(d.nodes)||!d.nodes.length||d.nodes.length>18||!Array.isArray(d.edges)||d.edges.length>32)throw new Error('模型节点或连线数量无效。');
  const ids=new Set();for(const n of d.nodes){if(!keys(n,['id','x','y','label','shape'])||!text(n.id,20)||!n.id||ids.has(n.id)||![n.x,n.y].every(v=>Number.isFinite(v)&&v>=12&&v<=88)||!text(n.label,18)||!['point','block','circle','vessel','junction'].includes(n.shape))throw new Error('图示节点无效。');ids.add(n.id);}
  for(const e of d.edges)if(!keys(e,['from','to','label','type'])||!ids.has(e.from)||!ids.has(e.to)||e.from===e.to||!text(e.label,24)||!['line','arrow','dashed','resistor','battery','lamp','switch'].includes(e.type))throw new Error('图示连线无效。');
  for(const e of d.edges){const a=d.nodes.find(n=>n.id===e.from),b=d.nodes.find(n=>n.id===e.to);if(a.x===b.x&&a.y===b.y)throw new Error('连线端点不能重合。');}
 }
 return structuredClone(d);
}
export const exerciseDiagramSchema={type:'object',additionalProperties:false,required:['kind','caption','description'],properties:{kind:{type:'string',enum:kinds},caption:{type:'string'},description:{type:'string'},xLabel:{type:'string'},yLabel:{type:'string'},xRange:{type:'array',items:{type:'number'}},yRange:{type:'array',items:{type:'number'}},series:{type:'array',items:{type:'object',additionalProperties:false,required:['label','points'],properties:{label:{type:'string'},points:{type:'array',items:{type:'array',items:{type:'number'}}}}}},nodes:{type:'array',items:{type:'object',additionalProperties:false,required:['id','x','y','label','shape'],properties:{id:{type:'string'},x:{type:'number'},y:{type:'number'},label:{type:'string'},shape:{type:'string',enum:['point','block','circle','vessel','junction']}}}},edges:{type:'array',items:{type:'object',additionalProperties:false,required:['from','to','label','type'],properties:{from:{type:'string'},to:{type:'string'},label:{type:'string'},type:{type:'string',enum:['line','arrow','dashed','resistor','battery','lamp','switch']}}}}}};
