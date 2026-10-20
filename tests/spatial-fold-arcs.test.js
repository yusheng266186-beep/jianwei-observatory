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
