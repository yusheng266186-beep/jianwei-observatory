import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import generator from '../backend/generator.cjs';
import control from '../backend/model-control.cjs';
import worker from '../backend/worker.cjs';
import stores from '../backend/store.cjs';
import delivery from '../backend/result-delivery.cjs';
import content from '../backend/content-check.cjs';
import {validateExerciseResult,exerciseSchemaFor} from '../app/engine/exercise-contract.js';
import {exerciseFigureParts} from '../app/engine/exercise-figure-layout.js';
import {requireExerciseQualityReview} from '../app/engine/exercise-quality.js';
const request={subject:'数学',grade:'高三',curriculum:'函数',focus:'函数代入',count:3,minutes:15,difficulty:'基础巩固',targets:['函数代入'],questionTypes:['填空'],visuals:'none',evidence:[]};
const sheet=()=>({title:'函数练习',objective:'函数代入',questions:[1,2,3].map(id=>({id,level:'巩固',type:'填空',target:'函数代入',stem:'已知 $f(x)=x^2$，求 $f('+id+')$。',choices:[],answer:String(id*id),analysis:'代入计算平方。',points:['计算正确得5分。'],maxScore:5,minutes:5}))});
const generation=control.snapshot({provider:'gemini',model:'gemini-3.8-flash',effort:'deep'},{GEMINI_API_KEY:'test-only'});

test('完整出题入口兼容JSON围栏，不被外层旧判断截断或多调用一次修复',async()=>{
 const s=sheet(),fenced='```json\n'+JSON.stringify(s)+'\n```';assert.deepEqual(await generator.validateOutput(fenced,request,{separateFigures:true}),s);
 const store=new stores.MemoryStore(),key='jobs/'+'a'.repeat(32)+'/'+crypto.randomUUID(),queue=[],at=Date.now();await store.create(key+'/meta.json',{type:'exercise',input:request,generation,pipeline:2,contentReview:1,createdAt:at,deadline:at+600000});let calls=0;
 const options={store,dispatch:async k=>queue.push(k),generator:async(input,o)=>generator.generate(input,{...o,key:'test-only',generation,transport:async()=>{calls++;return {status:200,body:JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:fenced}]}}]})};}})};
 await worker.run({key},options);assert.equal(queue.length,1);assert.equal((await store.get(queue[0]+'/meta.json')).value.type,'content-review');
 await worker.run({key:queue.shift()},{...options,contentReviewer:async(s,i,o)=>content.reviewContent(s,i,{...o,complete:async()=>({output:'{"approved":true,"issues":[],"corrections":[]}'})})});
 assert.equal((await store.get(key+'/result.json')).value.status,'ready');assert.equal(calls,1);assert.equal(await store.get(key+'/format-repair.json'),null);
});
test('60分作文和长用时不受理科单题上限限制，难度标签和时间估计不阻塞成卷',()=>{
 const r={...request,subject:'语文',targets:undefined,questionTypes:['简答','写作'],minutes:90},s=sheet();for(const q of s.questions){delete q.target;q.type='简答';}Object.assign(s.questions[2],{type:'写作',stem:'阅读材料“以行动回应问题”，写一篇议论文。',answer:'参考立意与示例论证。',analysis:'围绕材料展开论证。',maxScore:60,minutes:60,points:['按内容、表达和发展等级综合评定，共60分。']});
 assert.doesNotThrow(()=>validateExerciseResult(s,r));assert.equal(exerciseSchemaFor(r).properties.questions.items.properties.maxScore.maximum,undefined);
 const before=structuredClone(s);for(const difficulty of ['基础起步','基础巩固','方法进阶','综合提升','拓展挑战'])assert.doesNotThrow(()=>validateExerciseResult(s,{...r,difficulty,minutes:5}));assert.deepEqual(s,before);
});
test('缺失或含公式的插图锚点不会让生成、预览、PDF与Word共用布局失败',async()=>{
 const r={...request,visuals:'vector'},s=sheet(),q=s.questions[0];q.figureRequest={caption:'已知结构',requirements:'画一个给定三角形。',knownData:'A、B、C为三个顶点。',labels:['A','B','C'],precision:'exact',placement:{after:'与原句略有不同的引图说明。',width:'standard',aspect:'wide'}};
 q.stem='已知 $AB=2$，图形给定如下。\n求已知结构的性质。';q.diagram={kind:'drawing',caption:'示意图',description:'给定三角形',scene:[{type:'path',d:'M 100 100 L 300 100 L 200 260 Z'}]};
 assert.doesNotThrow(()=>validateExerciseResult(s,r));const parts=exerciseFigureParts(q);assert(parts.placementFallback);assert.equal(parts.before,'已知 $AB=2$，图形给定如下。');assert.equal(parts.after,'求已知结构的性质。');
 const {exercisePrintFigureParts}=await import('../app/engine/exercise-print.js');assert.deepEqual(exercisePrintFigureParts(q),parts);
});
test('关键词误报交由模型依据上下文核对，普通审阅建议不追加导出门槛',async()=>{
 const s=sheet();s.questions[0].analysis='下面引用错误分析中的“如果题干原意”措辞，再按原条件完成计算。';let prompt;
 const checked=await content.reviewContent(s,request,{complete:async p=>{prompt=p;return {output:'{"approved":true,"issues":[],"corrections":[]}'};}});
 assert(prompt.input.programChecks.some(x=>x.code==='draft-hint'));assert.deepEqual(checked.sheet,s);assert.doesNotThrow(()=>requireExerciseQualityReview({sheet:s,request,figureReviewNotes:[{questionId:1,issues:['可调整留白']}]}));
});
test('修复流程允许修正无效的显示元数据，仍保留原有条件、答案和评分',async()=>{
 const original=sheet();original.questions[0].level='提升';original.questions[0].minutes=2.5;original.questions[0].target='函数代入训练';const candidate=sheet();
 const fidelity=await generator.validateRepairFidelity(JSON.stringify(original),candidate,request);assert(fidelity.verified);
 candidate.questions[0].answer='改成另一个答案';await assert.rejects(generator.validateRepairFidelity(JSON.stringify(original),candidate,request),/MODEL_CONTENT_INVALID/);
});
test('完整但新类型的校验失败回传模型修复，安全与中断错误不自动重发',async()=>{
 const {default:repair}=await import('../backend/format-repair.cjs');
 const error=Object.assign(Error('MODEL_CONTENT_INVALID'),{cause:Error('第1题的难度标签不完整。'),output:JSON.stringify(sheet()),diagnostic:{completeSignal:true}});assert(repair.eligible(error));
 assert(!repair.eligible({...error,cause:Error('题目中存在非教学内容。')}));assert(!repair.eligible({...error,diagnostic:{completeSignal:false}}));
});
test('丢失触发的排队任务按同一ID补发，已有运行锁或结果时不再调模型',async()=>{
 const store=new stores.MemoryStore(),key='jobs/'+'b'.repeat(32)+'/'+crypto.randomUUID(),at=Date.now(),job={type:'exercise',input:request,generation,createdAt:at-25000,deadline:at+600000},queue=[];await store.create(key+'/meta.json',job);const options={now:()=>at,dispatch:async k=>queue.push(k)};
 await Promise.all(Array.from({length:8},()=>delivery.recover(store,key,job,options)));assert.deepEqual(queue,[key]);let calls=0;
 const run={store,...options,generator:async()=>{calls++;return {sheet:sheet()};}};await Promise.all([worker.run({key},run),worker.run({key},run)]);assert.equal(calls,1);assert.equal((await store.get(key+'/result.json')).value.status,'ready');await delivery.recover(store,key,job,options);assert.equal(queue.length,1);
});
