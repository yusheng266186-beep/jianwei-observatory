import test from 'node:test';
import assert from 'node:assert/strict';
import buildCatalog from '../tools/build-textbook-catalog.cjs';
import {textbookCatalog,textbookTopics} from '../app/data/textbook-catalog.js';
import {exerciseAllFocusLabels,createExerciseContentPicker} from '../app/ui/exercise-content-picker.js';
import {toggleExerciseFocus,exerciseFocusParts} from '../app/ui/exercise-focus.js';
import {validateExerciseRequest,exerciseSchemaFor,exercisePlanFor,validateExerciseResult} from '../app/engine/exercise-contract.js';
import {resizeExercisePlan,setExerciseQuestionType} from '../app/engine/exercise-question-plan.js';
import {exerciseSetupContent,applyExerciseSetup} from '../app/engine/exercise-setups.js';
import {createExerciseSetupShelf} from '../app/ui/exercise-setup-shelf.js';
import {exerciseRequestRows} from '../app/ui/exercise-request-brief.js';
import groups from '../backend/exercise-groups.cjs';
import scope from '../backend/exercise-group-scope.cjs';
import generator from '../backend/generator.cjs';
const request={subject:'数学',grade:'高三',curriculum:'人教A版已学内容',focus:'集合运算',targets:['集合运算'],count:6,minutes:30,difficulty:'方法进阶',questionTypes:[],questionPlan:[{id:1,type:'选择'},{id:2,type:'填空'},{id:3},{id:4,type:'多选'},{id:5,type:'解答'},{id:6,type:'填空'}],visuals:'none',evidence:[]};
test('十科55册版本与目录来源完整，生成目录一致，标签独立且可往返点选',()=>{
 const result=buildCatalog.build({check:true});assert.equal(result.books,55);assert(result.points>2000);
 for(const subject of ['语文','数学','英语','日语','物理','化学','生物','历史','政治','地理']){
  const catalog=textbookCatalog(subject),topics=textbookTopics(subject),labels=exerciseAllFocusLabels(subject);assert(catalog.books.every(b=>b.chapters.length));assert(topics.length>=100);assert.equal(new Set(topics.map(t=>t.value)).size,topics.length);
  for(const topic of topics){assert(topic.path.length===3);assert.deepEqual(exerciseFocusParts(toggleExerciseFocus('',topic.value,labels),labels),[topic.value]);assert.equal(toggleExerciseFocus(topic.value,topic.value,labels),'');}
 }
 assert.match(textbookCatalog('物理').edition,/教科/);assert.match(textbookCatalog('英语').edition,/外研/);
 assert(textbookTopics('物理').some(t=>t.label==='热力学第一定律计算'));
 assert(textbookTopics('化学').some(t=>t.label==='电化学计算'));
 assert(textbookTopics('政治').some(t=>t.label==='假言推理'));
 assert(textbookTopics('日语').some(t=>t.label.includes('Vていただく')));
});
test('跨册检索、分页与取消保留已选点，搜索文本安全转义且不扩写目标',()=>{
 const picker=createExerciseContentPicker(),topic=textbookTopics('数学').find(t=>t.label==='交集'),r={...request,targets:[topic.value],focus:topic.value};picker.restore(r);picker.search('数学','导数');const html=picker.options(r);assert(html.includes('导数与极值'));assert(!html.includes('复数加减乘除'));assert(picker.html(r,[]).includes('移除交集'));picker.search('数学','<img onerror=alert(1)>');assert(!picker.html(r,[]).includes('<img'));assert.equal(r.focus,topic.value);
});
test('逐题安排覆盖与自动题共存，Schema按题号约束，错误题型不能冒充成功',()=>{
 validateExerciseRequest(request);const plan=exercisePlanFor(request),schema=exerciseSchemaFor(request).properties.questions.prefixItems;assert.deepEqual(plan.map(s=>s.type),['选择','填空',undefined,'多选','解答','填空']);assert.deepEqual(schema[1].properties.type.enum,['填空']);assert.equal(schema[1].properties.choices.maxItems,0);assert.equal(schema[0].properties.choices.minItems,4);
 const sheet={title:'集合训练',objective:'练习集合运算',questions:plan.map((s,i)=>({id:i+1,type:s.type||'填空',target:s.target,level:'巩固',stem:'设集合第'+(i+1)+'题，求交集。',choices:['选择','多选'].includes(s.type)?['甲','乙','丙','丁']:[],answer:s.type==='选择'?'A':s.type==='多选'?'AB':'结果',analysis:'由集合定义计算。',points:['正确作答得5分'],maxScore:5,minutes:5}))};validateExerciseResult(sheet,request);sheet.questions[1].type='解答';assert.throws(()=>validateExerciseResult(sheet,request),/第2题须为填空/);
 assert.throws(()=>validateExerciseRequest({...request,questionPlan:[{id:2,type:'选择'}]}));assert.throws(()=>validateExerciseRequest({...request,questionPlan:request.questionPlan.map(s=>({...s,type:'翻译'}))}));
});
test('3至12题分组逐题类型精确切片，冻结scope与生成、复核共同保留',async()=>{
 for(let count=6;count<=12;count++){
  const r={...request,count,questionPlan:resizeExercisePlan(request,count)},parts=groups.plan(r);assert.deepEqual(scope.globalSlots(r),exercisePlanFor(r));assert.deepEqual(parts.flatMap(p=>p.slots.map(s=>({...s,id:s.id+p.offset}))),exercisePlanFor(r));
  for(const p of parts){validateExerciseRequest(p.input);const context=scope.createGroupContext({request:r,index:p.index,partCount:parts.length,offset:p.offset,slots:p.slots});scope.normalizeGroupScope(context,{count:p.input.count,request:p.input});assert.deepEqual(context.global.questionPlan,r.questionPlan);const prompt=await generator.buildExercisePrompt(p.input,{groupScope:context});for(const slot of p.slots.filter(s=>s.type))assert.deepEqual(prompt.schema.properties.questions.prefixItems[slot.id-1].properties.type.enum,[slot.type]);}
 }
 const part=groups.plan(request)[1],context=scope.createGroupContext({request,index:1,partCount:2,offset:3,slots:part.slots});const bad=structuredClone(context);bad.global.questionPlan[4].type='选择';assert.throws(()=>scope.normalizeGroupScope(bad,{count:3,request:part.input}));
 const old=structuredClone(request);delete old.questionPlan;assert.deepEqual(scope.globalSlots(old,2),scope.globalSlots(old,3));
});
test('题数调整、命名模板套用和摘要保留独立题型，旧模板不会携带残留安排',()=>{
 const old={...request,questionTypes:['选择','填空','解答']};delete old.questionPlan;assert.deepEqual(setExerciseQuestionType(old,0,'填空').questionPlan.slice(1),exercisePlanFor(old).slice(1).map(({id,type})=>({id,type})));let r=setExerciseQuestionType(request,2,'解答');assert.equal(r.questionPlan[2].type,'解答');assert.equal(resizeExercisePlan(r,4).length,4);assert.deepEqual(resizeExercisePlan(r,8).slice(6),[{id:7},{id:8}]);const content=exerciseSetupContent(r);const shelf=createExerciseSetupShelf({getRequest:()=>r,apply:()=>{}});shelf.load([{id:'design',name:'逐题训练',content,createdAt:1,updatedAt:1}]);shelf.choose('design');assert.match(shelf.html(),/第2题 填空/);assert.deepEqual(applyExerciseSetup({content},{...request,evidence:[]}).questionPlan,r.questionPlan);const legacy=structuredClone(content);delete legacy.questionPlan;assert.equal(applyExerciseSetup({content:legacy},r).questionPlan,undefined);assert(exerciseRequestRows(r).some(([_,value])=>value.includes('第2题 填空')));
});
