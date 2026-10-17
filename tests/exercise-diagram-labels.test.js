import test from 'node:test';import assert from 'node:assert/strict';
import {diagramLabelLines,exerciseDiagramSVG,diagramTicks} from '../app/io/exercise-diagram.js';
test('装置标签按可用宽度换行，化学式和英文单词不从中间截断',()=>{assert.deepEqual(diagramLabelLines('B 饱和NaHCO3'),['B 饱和NaHCO3']);const lines=diagramLabelLines('饱和碳酸氢钠NaHCO3溶液');assert.equal(lines.join(''),'饱和碳酸氢钠NaHCO3溶液');assert(lines.some(s=>s.includes('NaHCO3')));});
test('SVG化学式使用下标，坐标数字和已有数学幂保持原意',()=>{const svg=exerciseDiagramSVG({kind:'flow',caption:'流程',description:'已知试剂',nodes:[{id:'a',x:20,y:50,label:'NaHCO3',shape:'vessel'},{id:'b',x:80,y:50,label:'CO2',shape:'vessel'}],edges:[{from:'a',to:'b',label:'x^2 = 25',type:'arrow'}]});assert.match(svg,/NaHCO<tspan baseline-shift="sub" font-size="9">3<\/tspan>/);assert.match(svg,/CO<tspan baseline-shift="sub" font-size="9">2<\/tspan>/);assert(!svg.includes('₃'));assert.match(svg,/x² = 25/);});

test('坐标刻度使用可读间隔，包含零点且保持原坐标范围和小数量级',()=>{assert.deepEqual(diagramTicks([-2,2]),[-2,-1,0,1,2]);assert.deepEqual(diagramTicks([0,12]),[0,2,4,6,8,10,12]);assert.deepEqual(diagramTicks([0,.0006]),[0,.0001,.0002,.0003,.0004,.0005,.0006]);assert(diagramTicks([2.1,2.9]).every(n=>n>=2.1&&n<=2.9));});
