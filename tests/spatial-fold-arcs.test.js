import test from 'node:test';
import assert from 'node:assert/strict';
import {validateExerciseModel,solidModelGeometry,exerciseModelSchema} from '../app/engine/exercise-models.js';
import {exerciseDiagramSVG} from '../app/io/exercise-diagram.js';
import {exerciseModelFrame} from '../app/io/exercise-model.js';
import figures from '../backend/figure-generation.cjs';
const model=()=>({id:'spatial-frame',dimensions:[],labels:['A','B原位置','C','D','P'],vertices:[[0,0,0],[2,0,0],[2,2,0],[0,2,0],[1,1,Math.sqrt(2)]],links:[{from:0,to:1,hidden:true},{from:1,to:2,hidden:true},{from:2,to:3,hidden:false},{from:3,to:0,hidden:false},{from:0,to:2,hidden:false},{from:0,to:4,hidden:false},{from:4,to:2,hidden:false}],motionArcs:[{from:1,to:4,center:[1,1,0]}]});
const diagram=m=>({kind:'geometry',caption:'沿AC翻折，非按比例',description:'B沿圆弧移至P，折后两平面垂直。',model:m});
test('fold arc has the original and folded endpoints, constant radius and the same 3D projection',()=>{
 const m=model(),before=structuredClone(m);assert.equal(validateExerciseModel(diagram(m)),m);const g=solidModelGeometry(m),arc=g.motionArcs[0];
 assert.deepEqual(arc.vertices[0],m.vertices[1]);assert.deepEqual(arc.vertices.at(-1),m.vertices[4]);assert.deepEqual(arc.points[0],g.points[1]);assert.deepEqual(arc.points.at(-1),g.points[4]);
 for(const p of arc.vertices)assert(Math.abs(Math.hypot(...p.map((v,i)=>v-arc.center[i]))-Math.sqrt(2))<1e-8);
 const frame=exerciseModelFrame(m);for(const [x,y] of [...g.points,...arc.points])assert(x>frame.x+10&&x<frame.x+frame.width-10&&y>frame.y+10&&y<frame.y+frame.height-10);
 assert.deepEqual(m,before);assert.equal(exerciseModelSchema.properties.motionArcs.maxItems,4);
});
test('the 3D fold SVG contains the motion curve and direction arrow without dropping hidden edges',()=>{
 const svg=exerciseDiagramSVG(diagram(model()));assert.match(svg,/data-motion-arc="true"/);assert.match(svg,/data-motion-arrow="true"/);assert.match(svg,/stroke-dasharray="6 4"/);assert(!/NaN|Infinity|undefined/.test(svg));
});
test('invalid, unequal-radius, collinear, excessive and non-finite arc data are rejected',()=>{
 const badArcs=[{from:1,to:9,center:[1,1,0]},{from:1,to:1,center:[1,1,0]},{from:1,to:4,center:[0.2,0,0]},{from:1,to:4,center:[2,0,0]},{from:1,to:4,center:[NaN,1,0]},{from:1,to:4,center:[1001,1,0]}];
 for(const arc of badArcs){const m=model();m.motionArcs=[arc];assert.throws(()=>validateExerciseModel(diagram(m)),/运动弧/);}
 const opposite=model();opposite.motionArcs=[{from:1,to:3,center:[1,1,0]}];assert.throws(()=>validateExerciseModel(diagram(opposite)),/运动弧/);
 const many=model();many.motionArcs=Array.from({length:5},()=>many.motionArcs[0]);assert.throws(()=>validateExerciseModel(diagram(many)),/运动弧/);
 const cuboid={id:'cuboid',dimensions:[2,2,2],labels:['A','B','C','D','E','F','G','H'],motionArcs:[]};assert.throws(()=>validateExerciseModel(diagram(cuboid)),/仅用于/);
});
test('old wireframes and solids keep their exact geometry and SVG without motion arcs',()=>{
 const m=model();delete m.motionArcs;assert.doesNotThrow(()=>validateExerciseModel(diagram(m)));assert.deepEqual(solidModelGeometry(m),solidModelGeometry({...m,motionArcs:[]}));assert(!exerciseDiagramSVG(diagram(m)).includes('data-motion-arc'));
 const cube={id:'cuboid',dimensions:[2,2,2],labels:['A','B','C','D','E','F','G','H']};assert.equal(solidModelGeometry(cube).edges.length,12);
});
test('the shared backend planner accepts the real non-coplanar fold with its arc',async()=>{
 const stem='将三角形ABC沿AC翻折，点B移至P，使平面APC与原平面垂直。';
 const q={id:1,type:'填空',stem,choices:[],answer:'$2$',analysis:'由垂直关系求长度。',points:['答案正确得5分。'],figureRequest:{caption:'翻折示意',requirements:'绘制翻折后的空间图，并给从B到P的弧箭头。',knownData:'沿AC翻折至两平面垂直。',labels:[],precision:'exact',placement:{after:stem,width:'standard',aspect:'square'}}};
 const d=diagram(model());assert.deepEqual(await figures.parseFigurePlan(JSON.stringify({diagram:d}),q,{subject:'数学',visuals:'vector'}),d);
});
const parallelModel=()=>({id:'spatial-frame',dimensions:[],labels:['A','B','C','D','P'],vertices:[[2,2,0],[2,0,0],[0,0,0],[0,2,0],[1,1,Math.sqrt(2)]],links:[{from:0,to:1,hidden:false},{from:1,to:2,hidden:false},{from:2,to:3,hidden:false},{from:3,to:0,hidden:false},{from:1,to:3,hidden:false},{from:4,to:1,hidden:false},{from:4,to:3,hidden:false},{from:4,to:2,hidden:true}],views:[{title:'翻折前',vertices:[0,1,2,3],hiddenLinks:[]},{title:'翻折后',vertices:[1,2,3,4],hiddenLinks:[2]}],edgeLabels:[{from:0,to:1,text:'2'},{from:1,to:2,text:'2'},{from:4,to:2,text:'2'}]});
test('并列翻折视图共用原三维坐标，点A与点P只在对应分图出现，长度真实标注',()=>{const m=parallelModel(),before=structuredClone(m);validateExerciseModel(diagram(m));const svg=exerciseDiagramSVG(diagram(m)),left=svg.split('data-spatial-view="0"')[1].split('</g>')[0],right=svg.split('data-spatial-view="1"')[1].split('</g>')[0];assert.match(left,/>A<\/text>/);assert(!left.includes('>P</text>'));assert.match(right,/>P<\/text>/);assert(!right.includes('>A</text>'));assert.equal((svg.match(/>2<\/text>/g)||[]).length,4);assert.match(right,/stroke-dasharray/);assert(!/NaN|undefined|Infinity/.test(svg));assert.deepEqual(m,before);const f=exerciseModelFrame(m);assert.equal(f.width,640);assert.equal(f.height,320);});
test('分图不能遗漏顶点、使用断开的点组、未知边或重复长度标签',()=>{for(const mutate of [m=>m.views[1].vertices=[1,2,3],m=>m.views[0].vertices=[0,0,1],m=>m.views[0].hiddenLinks=[99],m=>m.views[0].hiddenLinks=[7],m=>m.edgeLabels.push({...m.edgeLabels[0]}),m=>m.edgeLabels[0].from=9,m=>m.views[0].title='<script>',m=>m.edgeLabels[0].text='$2$']){const m=parallelModel();mutate(m);assert.throws(()=>validateExerciseModel(diagram(m)),/空间分图/);}const cube={id:'cuboid',dimensions:[2,2,2],labels:['A','B','C','D','E','F','G','H'],views:[]};assert.throws(()=>validateExerciseModel(diagram(cube)),/标准模型/);});
test('云端图示契约接受并列图与已知长度，不丢失到导出端',async()=>{const stem='正方形沿BD翻折，A移到空间点P。',q={type:'填空',stem,choices:[],answer:'结果。',analysis:'按已知求解。',points:[],figureRequest:{requirements:'绘制翻折前与翻折后的两个空间视图。',precision:'exact'}};const d=diagram(parallelModel());assert.deepEqual(await figures.parseFigurePlan(JSON.stringify({diagram:d}),q,{subject:'数学',visuals:'vector'}),d);});
test('空间投影避开非关联顶点压在棱上，翻折后PC与PB能清楚辨认',()=>{const m=parallelModel(),g=solidModelGeometry(m);let minimum=Infinity;for(const view of m.views)for(const i of view.vertices)for(const e of m.links){if(i===e.from||i===e.to||!view.vertices.includes(e.from)||!view.vertices.includes(e.to))continue;const p=g.points[i],a=g.points[e.from],b=g.points[e.to],dx=b[0]-a[0],dy=b[1]-a[1],t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy);if(t>0&&t<1)minimum=Math.min(minimum,Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy));}assert(minimum>30,'非关联顶点与棱的距离不足以区分空间结构');});
