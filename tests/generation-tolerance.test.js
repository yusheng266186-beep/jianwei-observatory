import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {validateExerciseDiagram} from '../app/engine/exercise-diagrams.js';
import {exerciseDiagramSVG} from '../app/io/exercise-diagram.js';
import {parseExerciseJSON} from '../app/engine/exercise-contract.js';
import figures from '../backend/figure-generation.cjs';
import content from '../backend/content-review.cjs';
import check from '../backend/content-check.cjs';
import stores from '../backend/store.cjs';

// Reproduce the live failure: three unnamed points form a right-angle marker
// in the first panel, sharing the original verified spatial frame.
const fold=()=>({kind:'geometry',caption:'翻折前后示意',description:'矩形沿AC翻折，示意非按比例。',model:{id:'spatial-frame',dimensions:[],labels:['A','B','C','D','P','','',''],vertices:[[0,0,0],[1,Math.sqrt(3),0],[4,0,0],[3,-Math.sqrt(3),0],[1,0,Math.sqrt(3)],[.9,.9*Math.sqrt(3),0],[1.0732050807568878,1.4588457268119894,0],[1.1732050807568877,1.632050807568877,0]],links:[[0,1],[1,2],[2,3],[3,0],[0,2],[0,4],[4,2],[4,3],[1,5],[5,6],[6,7],[7,1]].map(([from,to])=>({from,to,hidden:false})),views:[{title:'翻折前',vertices:[0,1,2,3,5,6,7],hiddenLinks:[]},{title:'翻折后',vertices:[0,2,3,4],hiddenLinks:[4]}],edgeLabels:[{from:0,to:1,text:'2'},{from:1,to:2,text:'2√3'}]}});
const input={subject:'数学',grade:'高三',curriculum:'函数',focus:'函数代入',count:3,minutes:15,difficulty:'基础巩固',targets:['函数代入'],questionTypes:['填空'],visuals:'none',evidence:[]};
const sheet=()=>({title:'函数练习',objective:'函数代入',questions:[1,2,3].map(id=>({id,level:id===1?'基础':'巩固',type:'填空',target:'函数代入',stem:'已知 $f(x)=x^2$，求 $f('+id+')$。',choices:[],answer:String(id*id),analysis:'代入计算平方。',points:['计算正确得5分。'],maxScore:5,minutes:5}))});
const generation={provider:'gemini',model:'gemini-3.8-flash',protocol:'gemini',reasoningEffort:'high',timeoutMs:885000};

test('实际翻折图的无名直角辅助点可保留，浏览器和云端一致且不生成无名文字',async()=>{
 const d=fold(),original=structuredClone(d);assert.doesNotThrow(()=>validateExerciseDiagram(d));
 const backend=await import('../backend/exercise-diagrams.mjs');assert.deepEqual(backend.validateExerciseDiagram(d),d);
 const svg=exerciseDiagramSVG(d);assert(svg.includes('翻折前'));assert(svg.includes('翻折后'));assert(svg.includes('2√3'));assert(!/<text[^>]*><\/text>/.test(svg));assert(!/NaN|undefined/.test(svg));assert.deepEqual(d,original);
 const bad=fold();bad.model.labels[4]='A';assert.throws(()=>validateExerciseDiagram(bad),/全局唯一/);
});
test('完整JSON围栏与显示元数据省略直接兼容，不修改公式、数值或原图',async()=>{
 const data={text:'原文 $\\frac{1}{2}$\n保留字面\\n'};assert.deepEqual(parseExerciseJSON('```json\n'+JSON.stringify(data)+'\n```'),data);
 assert.throws(()=>parseExerciseJSON('```json\n{"text":"$\\frac{x}{2}$"\n```'));
 const d=fold();delete d.caption;delete d.description;delete d.model.links[0].hidden;
 const result=await figures.parseFigurePlan('```json\n'+JSON.stringify({diagram:d,summary:'额外说明不进入题文'})+'\n```',{id:1,stem:'翻折后两平面垂直。',choices:[]},{subject:'数学',visuals:'vector'});
 assert.equal(result.caption,'');assert.equal(result.description,'');assert.equal(result.model.links[0].hidden,false);assert.deepEqual(result.model.vertices,d.model.vertices);assert(!Object.hasOwn(d.model.links[0],'hidden'));
 const unsafe={kind:'drawing',caption:'',description:'',scene:[{type:'text',x:200,y:80,text:'<script>'}]};await assert.rejects(figures.parseFigurePlan(JSON.stringify({diagram:unsafe}),{id:1,stem:'',choices:[]},{subject:'数学',visuals:'vector'}),/FIGURE_PLAN_INVALID/);
});
test('模型明确通过时建议保留为备注，实质错误仍按模型判定拒绝',async()=>{
 const q={id:1,stem:'矩形ABCD沿AC翻折。',choices:[]};let prompt;
 const r=await figures.reviewFigure(q,{subject:'数学'},fold(),{complete:async p=>{prompt=p;return {output:'```json\n{"approved":true,"issues":["可补直角符号"],"summary":"可使用"}\n```'};}});
 assert(r.approved);assert.deepEqual(r.issues,[]);assert.deepEqual(r.layoutNotes,['可补直角符号']);assert.match(prompt.system,/题干已明确的直角/);
 const bad=await figures.reviewFigure(q,{subject:'数学'},fold(),{complete:async()=>({output:'{"approved":false,"issues":["折轴端点移动，与题干矛盾。"]}'})});assert(!bad.approved);assert.equal(bad.issues.length,1);
});
test('学科审查接受完整围栏、额外元数据和省略空数组，建议不会阻塞交付',async()=>{
 const original=sheet(),r=await check.reviewContent(original,input,{complete:async()=>({output:'```json\n{"approved":false,"issues":[{"questionId":1,"reason":"建议增加解释文字。","severity":"review"}],"summary":"总体正确"}\n```'})});
 assert(r.approved);assert.deepEqual(r.sheet,original);assert(r.notes[0].unresolved);
 const block={approved:false,issues:[{questionId:1,reason:'答案计算错误。',severity:'block'}]};await assert.rejects(check.reviewContent(original,input,{complete:async()=>({output:JSON.stringify(block)})}),/CONTENT_REVIEW_FAILED/);
});
test('内容错误自动带原稿、具体诊断和上一轮输出定点修订，不重新出题',async()=>{
 const store=new stores.MemoryStore(),key='jobs/'+'a'.repeat(32)+'/'+crypto.randomUUID(),queue=[],now=()=>Date.now(),options={now,dispatch:async k=>queue.push(k)},original=sheet();original.questions[0].answer='2';
 const job={input,generation,pipeline:2,contentReview:1,createdAt:now()};await content.begin(store,key,job,{sheet:original},options);let calls=0;
 const run=async()=>{const child=queue.shift(),meta=(await store.get(child+'/meta.json')).value;await content.runStep(store,child,meta,{...options,reviewer:async(s,i,o)=>{calls++;assert.deepEqual(s,original);if(calls>1){assert.match(o.feedback.notes[0].issues[0],/应为1/);assert.match(o.feedback.previousOutput,/approved/);assert.match(o.feedback.instruction,/不要重新命题/);}return check.reviewContent(s,i,{...o,complete:async()=>({output:JSON.stringify(calls===1?{approved:false,issues:[{questionId:1,reason:'第1题代入结果应为1。',severity:'block'}],corrections:[]}:{approved:true,issues:[{questionId:1,reason:'代入1的平方为1。',severity:'block'}],corrections:[{questionId:1,reason:'修正平方计算。',patch:{answer:'1'}}]})})});}});};
 await run();assert.equal((await content.snapshot(store,key,options)).status,'running');assert.equal(queue.length,1);await run();const result=await content.snapshot(store,key,options);assert.equal(result.status,'ready');assert.equal(calls,2);assert.equal(result.sheet.questions[0].answer,'1');assert.equal(original.questions[0].answer,'2');assert.equal(result.contentReview.changes.length,1);
});
