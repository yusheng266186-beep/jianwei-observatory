import test from 'node:test';import assert from 'node:assert/strict';
import {validateExerciseDiagram,validateGeneratedExerciseFigures} from '../app/engine/exercise-diagrams.js';
import {solidModelGeometry} from '../app/engine/exercise-models.js';
import {exerciseDiagramSVG} from '../app/io/exercise-diagram.js';
import {laboratory,changePlot,solidFigures,physicsFigures} from './fixtures/exercise-figures.js';
const question=diagram=>({id:1,stem:'实验气路如图所示，观察导管及液位。',choices:[],diagram});
test('具体仪器、液位及端口生成完整矢量气路，旧示意图可阅读但不能作为新装置题通过',()=>{
 assert.deepEqual(validateExerciseDiagram(laboratory),laboratory);assert.doesNotThrow(()=>validateGeneratedExerciseFigures({questions:[question(laboratory)]},{subject:'化学'}));
 const svg=exerciseDiagramSVG(laboratory);assert(svg.includes('data-equipment="three-neck-flask"'));assert.equal((svg.match(/data-equipment=/g)||[]).length,4);assert(svg.includes('clipPath'));assert(!svg.includes('undefined'));
 const second=exerciseDiagramSVG(laboratory),id=svg.match(/clipPath id="([^"]+)/)[1];assert(!second.includes('id="'+id+'"'));
 const legacy={...laboratory,nodes:laboratory.nodes.map(({equipment,liquidLevel,inlet,outlet,additionFunnel,...n})=>n),edges:laboratory.edges.map(e=>({...e,type:'arrow'}))};assert.doesNotThrow(()=>validateExerciseDiagram(legacy));assert.throws(()=>validateGeneratedExerciseFigures({questions:[question(legacy)]},{subject:'化学'}),/具体仪器/);
});
test('装置气路拒绝空瓶长导管、重复端口、重叠仪器及不支持的仪器，不猜测补图',()=>{
 for(const mutate of [d=>d.nodes[1].inlet='long',d=>d.edges.push({...d.edges[0]}),d=>d.nodes[1].x=23,d=>d.nodes[0].equipment='condenser',d=>d.edges[0].type='line']){const d=structuredClone(laboratory);mutate(d);assert.throws(()=>validateExerciseDiagram(d));}
});
test('新题引用缺图、流程框冒充结构图或化学曲线横坐标倒序时不能通过，完整数据表与绘图任务可不附图',()=>{
 assert.throws(()=>validateGeneratedExerciseFigures({questions:[question(undefined)]},{subject:'化学'}),/未提供/);
 const flow={kind:'flow',caption:'流程',description:'实验流程',nodes:[{id:'a',x:50,y:50,label:'A',shape:'block'}],edges:[]};assert.throws(()=>validateGeneratedExerciseFigures({questions:[{...question(flow),stem:'写出图中仪器名称。'}]},{subject:'化学'}),/流程框/);
 assert.doesNotThrow(()=>validateGeneratedExerciseFigures({questions:[{id:1,stem:'根据表中数据绘制变化图。',choices:[]}]},{subject:'化学'}));
 const bad=structuredClone(changePlot);bad.series[0].points.reverse();assert.throws(()=>validateGeneratedExerciseFigures({questions:[question(bad)]},{subject:'化学'}),/横坐标/);
 assert.doesNotThrow(()=>validateGeneratedExerciseFigures({questions:[question(changePlot)]},{subject:'化学'}));const svg=exerciseDiagramSVG(changePlot);assert(svg.includes('stroke-dasharray="7 4"'));assert.equal((svg.match(/polyline/g)||[]).length,2);
});
test('立体模型按真实顶点和面生成棱与遮挡，不接受伪装的圆锥或错误尺寸',()=>{
 for(const [i,d] of solidFigures.entries()){assert.deepEqual(validateExerciseDiagram(d),d);const g=solidModelGeometry(d.model);assert.equal(g.edges.length,[12,9,8][i]);assert(g.edges.some(e=>!e.visible));assert(g.edges.some(e=>e.visible));assert(g.points.every(([x,y])=>x>=100&&x<=540&&y>=60&&y<=310));assert(exerciseDiagramSVG(d).includes('stroke-dasharray="6 4"'));}
 assert.equal(solidModelGeometry(solidFigures[0].model).edges.filter(e=>!e.visible).length,3);
 for(const d of [ {...solidFigures[0],model:{...solidFigures[0].model,id:'cone'}},{...solidFigures[0],model:{...solidFigures[0].model,dimensions:[3,0,2]}},{...solidFigures[0],nodes:[]} ])assert.throws(()=>validateExerciseDiagram(d));
});
test('斜面和定滑轮只绘已知结构，不自动加入受力或运动答案；模板模型在浏览器和云端保持一致',async()=>{
 for(const d of physicsFigures){assert.doesNotThrow(()=>validateExerciseDiagram(d));const svg=exerciseDiagramSVG(d);assert(!svg.includes('undefined'));assert(!svg.includes('marker-end'));}
 const backend=await import('../backend/exercise-diagrams.mjs');for(const d of [laboratory,changePlot,...solidFigures,...physicsFigures])assert.deepEqual(backend.validateExerciseDiagram(d),validateExerciseDiagram(d));
});
test('模型画布贴近内容但保留标签边界，原始宽高与viewBox一致，避免移动端被大块留白缩小',()=>{for(const diagram of [...solidFigures,...physicsFigures]){const svg=exerciseDiagramSVG(diagram),box=svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number),width=Number(svg.match(/width="([\d.]+)"/)[1]),height=Number(svg.match(/height="([\d.]+)"/)[1]);assert(width<640);assert(width>150&&height>150);assert.equal(box[2],width);assert.equal(box[3],height);assert(box[0]>=0&&box[1]>=0&&box[0]+width<=640&&box[1]+height<=380);}});

test('常见发生器与倒置漏斗由参数图库绘制，拒绝漏斗端口、空液面和仪器类型混用',()=>{const d=structuredClone(laboratory);d.nodes[0].additionFunnel=true;d.nodes[3]={...d.nodes[3],equipment:'beaker',inlet:'funnel',outlet:'none'};assert.doesNotThrow(()=>validateExerciseDiagram(d));const svg=exerciseDiagramSVG(d);assert(svg.includes('data-accessory="separating-funnel"'));assert(svg.includes('data-accessory="inverted-funnel"'));for(const edit of [x=>x.nodes[3].liquidLevel=0,x=>x.nodes[3].equipment='gas-bottle',x=>x.nodes[0].inlet='short']){const bad=structuredClone(d);edit(bad);assert.throws(()=>validateExerciseDiagram(bad));}});
