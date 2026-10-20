import test from 'node:test';import assert from 'node:assert/strict';
import {validateExerciseDiagram,validateGeneratedExerciseFigures} from '../app/engine/exercise-diagrams.js';
import {solidModelGeometry} from '../app/engine/exercise-models.js';
import {exerciseDiagramSVG} from '../app/io/exercise-diagram.js';
import {apparatusSVG} from '../app/io/exercise-apparatus.js';
import guidance from '../backend/figure-guidance.cjs';
import generation from '../backend/figure-generation.cjs';
import {laboratory,changePlot,solidFigures,physicsFigures} from './fixtures/exercise-figures.js';
const question=diagram=>({id:1,stem:'实验气路如图所示，观察导管及液位。',choices:[],diagram});
test('翻折绘图提示要求表达两个空间平面，不能以画面内直角或同平面三角形替代',async()=>{
 let system='';await generation.planFigure({id:1,stem:'沿折轴翻折后，两平面垂直，立体示意如图。',choices:[]},{subject:'数学',visuals:'vector'},{complete:async p=>{system=p.system;return {output:JSON.stringify({diagram:solidFigures[0]})};}});
 assert.match(system,/立体翻折须用清楚的空间投影/);assert.match(system,/画面内两条线的直角不能代替题设的面面垂直/);assert.match(system,/不为套模板改题/);
});
test('自由绘图明确文字安全区与中心定位，越界反馈给出具体范围且不移动原图',async()=>{
 const d={kind:'drawing',caption:'反应历程',description:'已知反应历程示意',scene:[{type:'path',d:'M 50 350 L 600 350'},{type:'text',x:570,y:366,text:'反应历程'}]};
 assert.doesNotThrow(()=>validateExerciseDiagram(d));
 const invalid=structuredClone(d);invalid.scene[1].y=372;
 assert.throws(()=>validateExerciseDiagram(invalid),/y坐标须在18–366/);assert.equal(invalid.scene[1].y,372);
 invalid.scene[1]={type:'text',x:630,y:100,text:'反应历程'};assert.throws(()=>validateExerciseDiagram(invalid),/按中心定位.*安全区域/);
 let system='';await generation.planFigure({id:1,stem:'如图所示。',choices:[]},{subject:'化学',visuals:'vector'},{complete:async prompt=>{system=prompt.system;return {output:JSON.stringify({diagram:d})};}});
 assert.match(system,/文字基线y必须在18–366/);assert.match(system,/不能只保证中心点未超界/);
 const backend=await import('../backend/exercise-diagrams.mjs');assert.throws(()=>backend.validateExerciseDiagram(invalid),/按中心定位/);
});
test('排空气法空集气瓶允许长管，原样绘制空瓶及长短导管，不为适配校验伪造液体',async()=>{
 const d=structuredClone(laboratory);d.nodes[1].inlet='long';
 assert.doesNotThrow(()=>validateExerciseDiagram(d));
 const svg=apparatusSVG({...d.nodes[1],x:320,y:200},0,'dry-collection');
 assert(svg.includes('M -8 -78 V 50'));
 assert(svg.includes('M 8 -78 V -22'));
 assert(!svg.includes('<rect x="-48"'));
 assert.equal(d.nodes[1].liquidLevel,0);
 const backend=await import('../backend/exercise-diagrams.mjs');assert.deepEqual(backend.validateExerciseDiagram(d),d);
 assert.match(guidance.diagramGuide('化学'),/排空气法的空集气瓶.*liquidLevel:0/);
 assert.match(guidance.diagramGuide('化学'),/严禁为了满足模板而添加液体/);
});
test('具体仪器、液位及端口生成完整矢量气路，旧示意图可阅读但不能作为新装置题通过',()=>{
 assert.deepEqual(validateExerciseDiagram(laboratory),laboratory);assert.doesNotThrow(()=>validateGeneratedExerciseFigures({questions:[question(laboratory)]},{subject:'化学'}));
 const svg=exerciseDiagramSVG(laboratory);assert(svg.includes('data-equipment="three-neck-flask"'));assert.equal((svg.match(/data-equipment=/g)||[]).length,4);assert(svg.includes('clipPath'));assert(!svg.includes('undefined'));
 const second=exerciseDiagramSVG(laboratory),id=svg.match(/clipPath id="([^"]+)/)[1];assert(!second.includes('id="'+id+'"'));
 const legacy={...laboratory,nodes:laboratory.nodes.map(({equipment,liquidLevel,inlet,outlet,additionFunnel,...n})=>n),edges:laboratory.edges.map(e=>({...e,type:'arrow'}))};assert.doesNotThrow(()=>validateExerciseDiagram(legacy));assert.throws(()=>validateGeneratedExerciseFigures({questions:[question(legacy)]},{subject:'化学'}),/具体仪器/);
});
test('装置气路拒绝不足液位的浸液导管、重复端口、重叠仪器及不支持的仪器，不猜测补图',()=>{
 for(const mutate of [d=>{d.nodes[1].inlet='long';d.nodes[1].liquidLevel=10;},d=>d.edges.push({...d.edges[0]}),d=>d.nodes[1].x=23,d=>d.nodes[0].equipment='condenser',d=>d.edges[0].type='line']){const d=structuredClone(laboratory);mutate(d);assert.throws(()=>validateExerciseDiagram(d));}
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

test('翻折使用真实三维线框统一投影，拒绝把共面三角形冒充空间图',async()=>{
 const model={id:'spatial-frame',dimensions:[],labels:['B','E','A','P'],vertices:[[0,0,0],[4,0,0],[0,3,0],[4,0,3]],links:[{from:0,to:1,hidden:false},{from:0,to:2,hidden:false},{from:1,to:2,hidden:true},{from:0,to:3,hidden:false},{from:1,to:3,hidden:false}]},d={kind:'geometry',caption:'翻折空间示意，非按比例',description:'两个非共面三角形共享BE折轴。',model};
 assert.doesNotThrow(()=>validateExerciseDiagram(d));const g=solidModelGeometry(model);assert.equal(g.vertices[0][2],0);assert.equal(g.vertices[3][2],3);assert.equal(g.edges.length,5);assert.equal(g.edges.filter(x=>!x.visible).length,1);assert(g.points.every(([x,y])=>x>60&&x<580&&y>40&&y<340));const svg=exerciseDiagramSVG(d);assert(svg.includes('stroke-dasharray'));assert(!svg.includes('undefined'));
 const backend=await import('../backend/exercise-diagrams.mjs');assert.deepEqual(backend.validateExerciseDiagram(d),validateExerciseDiagram(d));
 for(const edit of [m=>m.vertices[3]=[4,3,0],m=>m.vertices[3]=[4,0,0],m=>m.links.push({...m.links[0]}),m=>m.links[0].from=9,m=>m.labels[3]='B',m=>m.vertices[3][2]=NaN,m=>m.links[0].hidden='false',m=>m.links=m.links.filter(e=>e.to!==3&&e.from!==3)]){const bad=structuredClone(d);edit(bad.model);assert.throws(()=>validateExerciseDiagram(bad));}
});

test('没有系列标签的单曲线图不留下无名图例横线，曲线与坐标保持完整',()=>{const d={...changePlot,series:[{label:'',points:changePlot.series[0].points}]},svg=exerciseDiagramSVG(d);assert(svg.includes('<polyline'));assert(!svg.includes('y1="347"'));const labelled=exerciseDiagramSVG({...d,series:[{...d.series[0],label:'测量值'}]});assert(labelled.includes('y1="347"'));assert(labelled.includes('测量值'));});
