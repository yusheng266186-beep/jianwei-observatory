import test from 'node:test';import assert from 'node:assert/strict';
import {scienceFigureSamples} from '../app/engine/exercise-figure-samples.js';
import {validateExerciseDiagram,validateGeneratedExerciseFigures} from '../app/engine/exercise-diagrams.js';
import {crystalSites} from '../app/engine/exercise-science.js';
import {molecularModel} from '../app/engine/exercise-molecular-model.js';
import {exerciseDiagramSVG} from '../app/io/exercise-diagram.js';
const get=family=>structuredClone(scienceFigureSamples.find(x=>x.diagram.spec?.family===family).diagram);
const reject=(family,edit,pattern)=>{const d=get(family);edit(d.spec);assert.throws(()=>validateExerciseDiagram(d),pattern);};
test('学科图示样张共用浏览器与云端结构合同，SVG不含缺失字段或活动内容',async()=>{
 const backend=await import('../backend/exercise-diagrams.mjs');for(const {diagram,subject} of scienceFigureSamples){assert.deepEqual(validateExerciseDiagram(diagram),diagram);assert.deepEqual(backend.validateExerciseDiagram(diagram),diagram);assert.doesNotThrow(()=>validateGeneratedExerciseFigures({questions:[{id:1,stem:'已知结构如图所示。',choices:[],diagram}]},{subject:subject==='图表'?'生物':subject}));const svg=exerciseDiagramSVG(diagram);assert(!/undefined|NaN|Infinity|<script|javascript:/.test(svg));assert(svg.includes('<svg'));}
});
test('电路拒绝交点未拆分、交叉、重叠、孤立节点、斜线和不够长的元件支路',()=>{
 reject('circuit',s=>s.nodes.push({id:'mid',x:190,y:80}),/拆分/);
 reject('circuit',s=>s.branches.push({...s.branches[0]}),/重叠|交叉/);
 reject('circuit',s=>s.nodes.push({id:'orphan',x:70,y:140}),/孤立/);
 reject('circuit',s=>s.nodes[0].y=90,/水平|竖直/);
 reject('circuit',s=>{s.nodes.push({id:'i',x:400,y:45},{id:'j',x:400,y:275});s.branches.push({from:'i',to:'j',component:'wire',label:''});},/交叉/);
 reject('circuit',s=>s.nodes[0].x=250,/空间/);
});
test('分子检查中性价键、氢数、重复键和标签距离，不擅自修补分子数据',()=>{
 reject('molecule',s=>s.atoms[0].hydrogens=4,/价键/);
 reject('molecule',s=>s.bonds[0].order=2,/价键/);
 reject('molecule',s=>s.bonds.push({...s.bonds[0]}),/重复/);
 reject('molecule',s=>{s.atoms[1].x=170;s.atoms[1].y=195;},/间距/);
 reject('molecule',s=>s.atoms[0].element='Fe',/中性/);
 assert.throws(()=>validateExerciseDiagram({...get('molecule'),nodes:[]}),/混入/);
});
test('球棍模型的分子组成、价键与四面体角由独立核算确认，不用平面十字冒充饱和碳',()=>{
 for(const [compound,formula] of [['methane',{C:1,H:4}],['ethane',{C:2,H:6}],['ethanol',{C:2,H:6,O:1}],['ethylene',{C:2,H:4}],['benzene',{C:6,H:6}]]){const m=molecularModel(compound),counts={};for(const a of m.atoms)counts[a.element]=(counts[a.element]||0)+1;assert.deepEqual(counts,formula);for(const [i,a] of m.atoms.entries())assert.equal(m.bonds.filter(b=>b.a===i||b.b===i).reduce((sum,b)=>sum+b.order,0),{C:4,H:1,O:2}[a.element]);if(['methane','ethane','ethanol'].includes(compound))for(const [i,a] of m.atoms.entries())if(a.element==='C'){const vectors=m.bonds.filter(b=>b.a===i||b.b===i).map(b=>m.atoms[b.a===i?b.b:b.a].p.map((x,k)=>x-a.p[k]));for(let j=0;j<vectors.length;j++)for(const v of vectors.slice(j+1)){const u=vectors[j],cos=u.reduce((sum,x,k)=>sum+x*v[k],0)/(Math.hypot(...u)*Math.hypot(...v));assert(Math.abs(cos+1/3)<1e-8);}}}
 reject('molecular-model',s=>s.compound='glucose',/球棍/);
});
test('晶胞分数坐标对应顶角、体心、面心与棱心，粒子归属数量可独立核算',()=>{
 for(const [lattice,counts] of [['simple-cubic',[1]],['body-centered-cubic',[2]],['face-centered-cubic',[4]],['cscl',[1,1]],['rock-salt',[4,4]]]){const sites=crystalSites(lattice);assert.equal(new Set(sites.map(p=>p.position.join(','))).size,sites.length);for(const [i,n] of counts.entries())assert.equal(sites.filter(p=>p.species===i).reduce((sum,p)=>sum+p.share,0),n);}
 reject('crystal',s=>s.lattice='diamond',/晶格/);reject('crystal',s=>s.labels=[],/图例/);
});
test('生物图示拒绝细胞类型冲突、重复结构、错误DNA配对，不自动补未知碱基',()=>{
 reject('cell',s=>s.cellType='animal',/细胞类型/);reject('cell',s=>{s.parts=s.parts.slice(0,2);s.parts.push({...s.parts[0]});},/重复/);
 reject('dna',s=>s.bottom='AACGGCAT',/互补/);reject('dna',s=>s.top='AUGCCGTA',/ATCG|等长/);
 const d=get('dna');d.spec.top='?TGCCGTA';const svg=exerciseDiagramSVG(d);assert(svg.includes('>?</text>'));assert.equal((svg.match(/stroke-dasharray="2 2"/g)||[]).length,18);
 const cell=get('cell');cell.spec.parts=[{id:'nucleus',label:'甲'}];const rendered=exerciseDiagramSVG(cell);assert(!rendered.includes('叶绿体'));assert(!rendered.includes('线粒体'));
});
test('学科图示不跨科冒用；模型未给定传送方向时不加入方向箭头',()=>{
 assert.throws(()=>validateGeneratedExerciseFigures({questions:[{id:1,stem:'图示',choices:[],diagram:get('dna')}]},{subject:'物理'}),/科目/);
 reject('mechanics',s=>s.angle=60,/倾角|物理模型/);reject('mechanics',s=>{s.model='horizontal-block';s.direction='right';},/方向/);
});
test('传送带初始位置由明确参数绘制，新图缺少位置时不通过；长标签不溢出结构边界',()=>{
 const d=get('mechanics');d.spec.blockPosition='left';assert(exerciseDiagramSVG(d).includes('x="180" y="158"'));d.spec.blockPosition='right';assert(exerciseDiagramSVG(d).includes('x="380" y="158"'));delete d.spec.blockPosition;assert.doesNotThrow(()=>validateExerciseDiagram(d));assert.throws(()=>validateGeneratedExerciseFigures({questions:[{id:1,stem:'如图所示。',choices:[],diagram:d}]},{subject:'物理'}),/初始位置/);
 reject('cell',s=>s.parts[0].label='这是一个非常长的结构标签',/标签/);
 reject('photosynthesis',s=>s.labels[2]='这是一个放不进反应阶段方框的长标签',/标签/);
});
test('多组柱图位置分开、零值没有伪高度；散点图不连线、不做自动拟合',()=>{
 const bars=structuredClone(scienceFigureSamples.find(x=>x.diagram.kind==='bars').diagram);bars.series[0].points[0][1]=0;const svg=exerciseDiagramSVG(bars),xs=[...svg.matchAll(/data-bar-series="\d" x="([^"]+)/g)].map(x=>Number(x[1]));assert.equal(new Set(xs).size,6);assert(svg.includes('height="0"'));bars.yRange=[1,10];assert.throws(()=>validateExerciseDiagram(bars),/包含0/);
 const scatter=exerciseDiagramSVG(scienceFigureSamples.find(x=>x.diagram.kind==='scatter').diagram);assert(!scatter.includes('<polyline'));assert(scatter.includes('<circle'));
});
