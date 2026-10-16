import {validateGeographyFigure,geographySchemaProperties} from './exercise-geography.js';
import {molecularCompounds} from './exercise-molecular-model.js';
// Semantic figure contracts. Rendering never invents atoms, circuit branches,
// biological labels or a complementary DNA strand from missing model output.
export const scienceFamilies=['mechanics','circuit','molecule','molecular-model','crystal','cell','photosynthesis','dna','terrain','climate'];
const clean=(s,n=24)=>typeof s==='string'&&s.length<=n&&!/[<>$\\\u0000-\u001f]/u.test(s);
const exact=(v,fields)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>fields.includes(k))&&fields.every(k=>Object.hasOwn(v,k));
const fail=message=>{throw new Error(message);};
const point=(p)=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=55&&p.x<=585&&p.y>=45&&p.y<=305;
const pairs=a=>a.flatMap((p,i)=>a.slice(i+1).map(q=>[p,q]));
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const on=(a,b,p)=>Math.abs(cross(a,b,p))<1e-7&&p.x>=Math.min(a.x,b.x)&&p.x<=Math.max(a.x,b.x)&&p.y>=Math.min(a.y,b.y)&&p.y<=Math.max(a.y,b.y);
export function segmentsMeet(a,b,c,d){
 const x=cross(a,b,c),y=cross(a,b,d),z=cross(c,d,a),w=cross(c,d,b);
 return x*y<0&&z*w<0||[on(a,b,c),on(a,b,d),on(c,d,a),on(c,d,b)].some(Boolean);
}
function connected(nodes,edges){const found=new Set([nodes[0].id]);for(let i=0;i<nodes.length;i++)for(const e of edges)if(found.has(e.from)||found.has(e.to)){found.add(e.from);found.add(e.to);}return found.size===nodes.length;}
const labels=(a,n)=>Array.isArray(a)&&a.length===n&&a.every(s=>clean(s,18));
export const scienceTextWidth=s=>[...s].reduce((n,c)=>n+(/[^\x00-\xff]/.test(c)?13:7),0);
export const cellParts=['wall','membrane','cytoplasm','nucleus','vacuole','chloroplast','mitochondrion','er','golgi','ribosome'];
export function validateScienceFigure(s){
 if(!s||!scienceFamilies.includes(s.family))fail('学科图示类别无效。');
 if(['terrain','climate'].includes(s.family))return validateGeographyFigure(s);
 if(s.family==='mechanics'){
  if(!exact({...s,blockPosition:s.blockPosition??'center'},['family','model','angle','direction','labels','blockPosition'])||!['horizontal-block','conveyor','spring-block'].includes(s.model)||!['left','center','right'].includes(s.blockPosition??'center')||!Number.isFinite(s.angle)||s.angle<0||s.angle>35||!['left','right','none'].includes(s.direction)||!labels(s.labels,s.model==='spring-block'?3:2)||s.model!=='conveyor'&&(s.angle!==0||s.direction!=='none'||s.blockPosition&&s.blockPosition!=='center'))fail('物理模型需明确结构、标签和已知传送方向；只有传送带可设置倾角、物块位置与方向。');
  if(s.labels.some((label,i)=>scienceTextWidth(label)>(s.model==='spring-block'?[84,130,90]:[230,72])[i]))fail('物理模型标签过长，请将长说明放在题干。');
 }else if(s.family==='circuit'){
  if(!exact(s,['family','nodes','branches'])||!Array.isArray(s.nodes)||s.nodes.length<2||s.nodes.length>24||!Array.isArray(s.branches)||!s.branches.length||s.branches.length>32)fail('电路节点或支路不完整。');
  const ids=new Map();for(const n of s.nodes){if(!exact(n,['id','x','y'])||!clean(n.id,16)||!n.id||ids.has(n.id)||!point(n)||s.nodes.some(p=>p!==n&&p.x===n.x&&p.y===n.y))fail('电路节点重复或坐标无效。');ids.set(n.id,n);}
  for(const e of s.branches){const a=ids.get(e.from),b=ids.get(e.to);if(!exact(e,['from','to','component','label'])||!a||!b||a===b||!['wire','resistor','battery','lamp','switch-open','switch-closed','ammeter','voltmeter','capacitor','diode'].includes(e.component)||!clean(e.label,12)||a.x!==b.x&&a.y!==b.y||Math.hypot(a.x-b.x,a.y-b.y)<(e.component==='wire'?24:76))fail('电路支路须为明确端点的水平或竖直线段，元件需留足空间。');
   if(s.nodes.some(p=>p!==a&&p!==b&&on(a,b,p)))fail('支路经过连接点时须在该点拆分，不能含糊表示连接。');
   if(e.label){const x=(a.x+b.x)/2+(a.x===b.x?(e.component==='wire'?20:35):0),y=(a.y+b.y)/2-(a.y===b.y?(e.component==='wire'?12:31):0),w=scienceTextWidth(e.label);if(x-w/2<8||x+w/2>632||y-13<5)fail('电路标签超出图边界，请缩短标签或调整支路位置。');}
  }
  for(const [e,f] of pairs(s.branches)){const common=[e.from,e.to].filter(id=>id===f.from||id===f.to),a=ids.get(e.from),b=ids.get(e.to),c=ids.get(f.from),d=ids.get(f.to);if(common.length===2||!common.length&&segmentsMeet(a,b,c,d)||common.length===1&&cross(a,b,c)===0&&cross(a,b,d)===0&&[a,b].some(p=>p.id!==common[0]&&on(c,d,p))||common.length===1&&[c,d].some(p=>p.id!==common[0]&&on(a,b,p)))fail('电路线段重叠或交叉；连接须使用显式节点，跨线须重新布置。');}
  if(!connected(s.nodes,s.branches))fail('电路存在未连接的孤立部分。');
 }else if(s.family==='molecule'){
  if(!exact(s,['family','atoms','bonds'])||!Array.isArray(s.atoms)||!s.atoms.length||s.atoms.length>30||!Array.isArray(s.bonds)||s.bonds.length>36)fail('分子原子或化学键不完整。');
  const valence={C:4,N:3,O:2,H:1,F:1,Cl:1,Br:1,I:1},ids=new Map(),sums=new Map();
  for(const a of s.atoms){if(!exact(a,['id','element','hydrogens','x','y'])||!clean(a.id,16)||!a.id||ids.has(a.id)||!Object.hasOwn(valence,a.element)||!Number.isInteger(a.hydrogens)||a.hydrogens<0||a.hydrogens>4||a.element==='H'&&a.hydrogens!==0||!point(a))fail('分子图仅接受明确的中性常见元素、氢原子数和原子坐标。');ids.set(a.id,a);sums.set(a.id,a.hydrogens);}
  for(const [a,b] of pairs(s.atoms))if(Math.hypot(a.x-b.x,a.y-b.y)<58)fail('分子原子标签间距不足。');
  const used=new Set();for(const b of s.bonds){const a=ids.get(b.from),c=ids.get(b.to),key=[b.from,b.to].sort().join('/');if(!exact(b,['from','to','order'])||!a||!c||a===c||![1,2,3].includes(b.order)||used.has(key))fail('化学键端点、键级或重复成键无效。');used.add(key);sums.set(a.id,sums.get(a.id)+b.order);sums.set(c.id,sums.get(c.id)+b.order);
   if(s.atoms.some(p=>p!==a&&p!==c&&on(a,c,p)))fail('化学键不能穿过其他原子。');
  }
  if(s.atoms.some(a=>sums.get(a.id)!==valence[a.element]))fail('分子价键与显式氢数不匹配；离子、自由基和配位键应采用专门表达。');
  for(const [a,b] of pairs(s.bonds))if(![a.from,a.to].some(id=>id===b.from||id===b.to)&&segmentsMeet(ids.get(a.from),ids.get(a.to),ids.get(b.from),ids.get(b.to)))fail('分子化学键相交，需要重新布置原子坐标。');
  if(!connected(s.atoms,s.bonds))fail('单个分子图中不能混入未连接的分子。');
 }else if(s.family==='molecular-model'){
  if(!exact(s,['family','compound'])||!molecularCompounds.includes(s.compound))fail('球棍模型只支持已定义几何结构的常见分子，不能冒用其他结构。');
 }else if(s.family==='crystal'){
  if(!exact(s,['family','lattice','labels'])||!['simple-cubic','body-centered-cubic','face-centered-cubic','cscl','rock-salt'].includes(s.lattice)||!labels(s.labels,['cscl','rock-salt'].includes(s.lattice)?2:1)||s.labels.some(x=>!x||scienceTextWidth(x)>130)||s.labels.length===2&&s.labels[0]===s.labels[1])fail('晶胞需指定已支持的晶格与互不混淆的粒子图例。');
 }else if(s.family==='cell'){
  if(!exact(s,['family','cellType','parts'])||!['plant','animal'].includes(s.cellType)||!Array.isArray(s.parts)||!s.parts.length||s.parts.length>10)fail('细胞图需指定植物或动物细胞及所需结构。');const seen=new Set();for(const p of s.parts){if(!exact(p,['id','label'])||!cellParts.includes(p.id)||seen.has(p.id)||!clean(p.label,12)||scienceTextWidth(p.label)>84||s.cellType==='animal'&&['wall','chloroplast','vacuole'].includes(p.id))fail('细胞结构重复、标签无效或不适用于该细胞类型。');seen.add(p.id);}
 }else if(s.family==='photosynthesis'){
  if(!exact(s,['family','labels'])||!labels(s.labels,11)||s.labels.some((x,i)=>scienceTextWidth(x)>[210,210,110,110,100,82,160,82,160,200,240][i]))fail('光合作用图须提供11个位置的简短明确标签，待考查位置可使用甲乙或空字符串。');
 }else if(s.family==='dna'){
  if(!exact(s,['family','top','bottom','orientation','labels','showPairs'])||!['5to3','3to5'].includes(s.orientation)||!labels(s.labels,2)||typeof s.showPairs!=='boolean'||typeof s.top!=='string'||typeof s.bottom!=='string'||!/^[ATCG?]{4,24}$/.test(s.top)||s.bottom.length!==s.top.length||!/^[ATCG?]+$/.test(s.bottom))fail('DNA片段须明确两条等长链、方向和4–24个碱基；未知碱基写?。');const complement={A:'T',T:'A',C:'G',G:'C'};for(let i=0;i<s.top.length;i++)if(s.top[i]!=='?'&&s.bottom[i]!=='?'&&complement[s.top[i]]!==s.bottom[i])fail('DNA两条链的已知碱基不符合互补配对。');
 }
 return s;
}
export function crystalSites(lattice){
 const sites=[];for(const x of [0,1])for(const y of [0,1])for(const z of [0,1])sites.push({position:[x,y,z],species:0,share:1/8});
 if(['face-centered-cubic','rock-salt'].includes(lattice))for(let axis=0;axis<3;axis++)for(const side of [0,1]){const p=[.5,.5,.5];p[axis]=side;sites.push({position:p,species:0,share:1/2});}
 if(['body-centered-cubic','cscl','rock-salt'].includes(lattice))sites.push({position:[.5,.5,.5],species:lattice==='body-centered-cubic'?0:1,share:1});
 if(lattice==='rock-salt')for(let axis=0;axis<3;axis++)for(const a of [0,1])for(const b of [0,1]){const p=[0,0,0];p[axis]=.5;p[(axis+1)%3]=a;p[(axis+2)%3]=b;sites.push({position:p,species:1,share:1/4});}
 return sites;
}
const string={type:'string'},number={type:'number'},strings={type:'array',items:string};
export const scienceFigureSchema={type:'object',additionalProperties:false,required:['family'],properties:{...geographySchemaProperties,family:{type:'string',enum:scienceFamilies},model:string,compound:{type:'string',enum:molecularCompounds},angle:number,blockPosition:{type:'string',enum:['left','center','right']},direction:{type:'string',enum:['left','right','none']},labels:strings,nodes:{type:'array',items:{type:'object',additionalProperties:false,required:['id','x','y'],properties:{id:string,x:number,y:number}}},branches:{type:'array',items:{type:'object',additionalProperties:false,required:['from','to','component','label'],properties:{from:string,to:string,component:string,label:string}}},atoms:{type:'array',items:{type:'object',additionalProperties:false,required:['id','element','hydrogens','x','y'],properties:{id:string,element:string,hydrogens:{type:'integer'},x:number,y:number}}},bonds:{type:'array',items:{type:'object',additionalProperties:false,required:['from','to','order'],properties:{from:string,to:string,order:{type:'integer'}}}},lattice:{type:'string',enum:['simple-cubic','body-centered-cubic','face-centered-cubic','cscl','rock-salt']},cellType:{type:'string',enum:['plant','animal']},parts:{type:'array',items:{type:'object',additionalProperties:false,required:['id','label'],properties:{id:string,label:string}}},top:string,bottom:string,orientation:{type:'string',enum:['5to3','3to5']},showPairs:{type:'boolean'}}};
