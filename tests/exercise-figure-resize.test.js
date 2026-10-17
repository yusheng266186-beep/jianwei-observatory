import test from 'node:test';import assert from 'node:assert/strict';
import {exerciseFigureParts,exerciseFigurePageWidth,exerciseFigureMaxHeight,exerciseFigurePercent} from '../app/engine/exercise-figure-layout.js';
import {exercisePrintFigureParts} from '../app/engine/exercise-print.js';
import {validateExerciseResult,validateExerciseFigureRequest} from '../app/engine/exercise-contract.js';
import {scienceFigureSamples} from '../app/engine/exercise-figure-samples.js';
import {exerciseDiagramHTML} from '../app/io/exercise-diagram.js';
const request={subject:'数学',grade:'高三',curriculum:'圆锥曲线',focus:'椭圆',count:3,minutes:15,difficulty:'基础巩固',evidence:[],visuals:'vector'};
const placement={after:'椭圆如图所示。',width:'standard',aspect:'wide'};
const sheet=()=>({title:'图示排版核对',objective:'识别椭圆',questions:[1,2,3].map(id=>({id,level:id===1?'基础':'巩固',type:'填空',stem:'椭圆如图所示。\n求第'+id+'个量。',choices:[],answer:'$2$',analysis:'按定义计算。',points:['计算正确得5分。'],maxScore:5,minutes:5,diagram:scienceFigureSamples[0].diagram,figureLayout:{...placement,widthPercent:43.2}}))});
test('教师拖动宽度保存到原题，PDF和Word共同尺寸尊重自定值，仍保留题干插图位置',async()=>{
 const doc=sheet(),before=structuredClone(doc);assert.equal(validateExerciseResult(doc,request),doc);assert.deepEqual(doc,before);
 const layout=exercisePrintFigureParts(doc.questions[0]);assert.equal(layout.width,exerciseFigurePageWidth*.432);assert.equal(layout.height,exerciseFigureMaxHeight);assert.equal(layout.before,placement.after);assert.equal(layout.after,'求第1个量。');assert.equal(layout.widthPercent,43.2);
 const server=await import('../backend/exercise-contract.mjs');assert.doesNotThrow(()=>server.validateExerciseResult(doc,request));
 const auto=structuredClone(doc.questions[0]);delete auto.figureLayout.widthPercent;assert.equal(exercisePrintFigureParts(auto).width,300);
});
test('自定宽度只允许有效数字，模型图示委托继续只接受三个预设',()=>{
 for(const widthPercent of [0,19.9,100.1,NaN,Infinity,'45',null]){const doc=sheet();doc.questions[0].figureLayout.widthPercent=widthPercent;assert.throws(()=>validateExerciseResult(doc,request),/版位/);}
 for(const value of [20,100,55.5]){const doc=sheet();doc.questions[0].figureLayout.widthPercent=value;assert.doesNotThrow(()=>validateExerciseResult(doc,request));}
 assert.equal(exerciseFigurePercent(120),100);assert.equal(exerciseFigurePercent(4),20);assert.equal(exerciseFigurePercent(43.234),43.2);
 assert.throws(()=>validateExerciseFigureRequest({caption:'椭圆',requirements:'按题绘制',knownData:'已知方程',labels:[],precision:'exact',placement:{...placement,widthPercent:50}}));
});
test('只有审题预览出现缩放控制，图注和矢量不被拉伸，自动布局保持原样',async()=>{
 const q=sheet().questions[0],layout=exerciseFigureParts(q),html=await exerciseDiagramHTML(q.diagram,{layout,resizable:true,questionId:1});assert.match(html,/style="width:43.2%;max-width:none"/);assert.match(html,/data-figure-resize role="slider"/);assert.match(html,/data-figure-ratio=/);assert.match(html,/<figcaption>/);
 const plain=await exerciseDiagramHTML(q.diagram,{layout});assert(!plain.includes('data-figure-resize'));assert(plain.includes('width:43.2%'));
 const preset=await exerciseDiagramHTML(q.diagram,{layout:{size:'compact'}});assert(!preset.includes('style="width:'));assert(preset.includes('data-layout-width="compact"'));
});
