import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import stores from '../backend/store.cjs';
import worker from '../backend/worker.cjs';
import groups from '../backend/exercise-groups.cjs';
import scope from '../backend/exercise-group-scope.cjs';
import generator from '../backend/generator.cjs';
import contentCheck from '../backend/content-check.cjs';
import contentReview from '../backend/content-review.cjs';
import formatRepair from '../backend/format-repair.cjs';
import {exercisePlanFor,validateExerciseRequest,validateExerciseResult} from '../app/engine/exercise-contract.js';
const request={subject:'数学',grade:'高三',curriculum:'高中数学已学内容',focus:'分式不等式、立体几何翻折与概率递推',count:6,minutes:60,difficulty:'基础巩固',targets:['分式不等式','立体几何翻折','概率递推证明'],questionTypes:['选择','填空','解答'],visuals:'none',evidence:[],requirements:'整卷必须包含一道立体几何翻折题；其余题目覆盖分式不等式和概率递推证明；不得降低难度，也不得把整卷要求压给单组。'};
const profile={provider:'gemini',model:'gemini-3.8-flash',protocol:'gemini',reasoningEffort:'high',timeoutMs:885000};
const priorStem='PRIOR-READY-STEM：矩形沿对角线翻折，求二面角。';
function documentFor(context,tag){return {sheet:{title:tag+'练习',objective:request.focus,questions:context.slots.map((slot,index)=>{const choice=['选择','多选'].includes(slot.type);return {id:slot.id,level:['基础','巩固','巩固'][index]||'巩固',type:slot.type,target:slot.target,stem:tag+'第'+slot.id+'题：已知完整条件，求解。',choices:choice?['一','二','三','四']:[],answer:choice?'A':'参考答案',analysis:'完整解析与结论。',points:[choice?'选对得5分。':'正确完成作答得5分。'],maxScore:5,minutes:10};})},model:profile.model,usage:{input:10,output:20,thinking:30}};}
function priorContext(){return scope.createGroupContext({request,index:1,partCount:2,offset:3,slots:groups.plan(request)[1].slots,completed:[scope.questionSummary({id:1,target:'分式不等式',type:'选择',level:'基础',stem:'前组第1题。',figure:false},1),scope.questionSummary({id:2,target:'分式不等式',type:'选择',level:'巩固',stem:'前组第2题。',figure:false},2),scope.questionSummary({id:3,target:'立体几何翻折',type:'填空',level:'巩固',stem:priorStem,figure:true},3)]});}
async function setup(){const store=new stores.MemoryStore(),queue=[],key='jobs/'+'c'.repeat(32)+'/'+crypto.randomUUID(),dispatch=async child=>queue.push(child);await store.create(key+'/meta.json',{id:key.split('/').at(-1),type:'exercise',generation:profile,input:request,createdAt:Date.now(),deadline:Date.now()+7200000});return {store,queue,key,dispatch};}
async function firstRound(lab){const calls=[],generator=async(input,options={})=>{calls.push({input:structuredClone(input),scope:structuredClone(options.groupScope)});const result=documentFor(options.groupScope,'第'+calls.length+'组');validateExerciseResult(result.sheet,input);return result;};await worker.run({key:lab.key},{store:lab.store,generator,dispatch:lab.dispatch});const firstKey=lab.queue.shift();await worker.run({key:firstKey},{store:lab.store,generator,dispatch:lab.dispatch});return {calls,generator,firstKey};}
test('原卷练习计划切片精确等于globalplan，3至12题边界不变',()=>{
 for(let count=6;count<=12;count++)for(const targets of [[],['甲'],['甲','乙','丙'],['甲','乙','丙','丁']]){
  const sample={...request,count,minutes:60,targets,questionTypes:count%2?['填空','解答']:['选择','填空','解答']},whole=exercisePlanFor(sample),parts=groups.plan(sample);
  assert.deepEqual(scope.globalSlots(sample),whole);
  assert.deepEqual(parts.flatMap(part=>part.slots.map(slot=>({...slot,id:slot.id+part.offset}))),whole);
  assert.equal(parts.reduce((n,part)=>n+part.input.count,0),count);
  assert.equal(parts.reduce((n,part)=>n+part.input.minutes,0),60);
  for(const part of parts)validateExerciseRequest(part.input);
 }
 const parts=groups.plan(request);
 assert.equal(parts.length,2);
 assert.deepEqual(parts.map(part=>part.offset),[0,3]);
 assert.deepEqual(parts[1].slots,[{id:1,target:'立体几何翻折',type:'填空'},{id:2,target:'概率递推证明',type:'解答'},{id:3,target:'概率递推证明',type:'解答'}]);
 assert.deepEqual(parts.flatMap(part=>part.slots.map(slot=>({...slot,id:slot.id+part.offset}))),exercisePlanFor(request));
 assert.equal(groups.grouped({...request,count:5}),false);
});
test('分组冻结本组槽位和前组已完成摘要，原卷请求不被改写且前组成稿字节保留',async()=>{
 const lab=await setup(),{calls,generator:generate,firstKey}=await firstRound(lab);
 assert.equal(lab.queue.length,1);
 const firstPath=await lab.store.get(firstKey+'/recovered.json')?'/recovered.json':'/result.json',firstResult=(await lab.store.get(firstKey+firstPath)).value,firstBytes=JSON.stringify(firstResult),firstSheet=structuredClone(firstResult.sheet);
 const manifest=(await lab.store.get(lab.key+'/groups.json')).value;
 assert.deepEqual(manifest.input,request);
 assert.deepEqual(manifest.slots,exercisePlanFor(request));
 const secondKey=lab.queue.shift(),secondMeta=(await lab.store.get(secondKey+'/meta.json')).value,context=secondMeta.groupContext;
 assert(context);
 assert.deepEqual(context.group,{index:2,count:2,offset:3,size:3,firstQuestion:4,lastQuestion:6});
 assert.deepEqual(context.slots,[{id:1,target:'立体几何翻折',type:'填空'},{id:2,target:'概率递推证明',type:'解答'},{id:3,target:'概率递推证明',type:'解答'}]);
 assert.equal(context.global.count,6);assert.equal(context.global.minutes,60);
 assert.deepEqual(context.global.targets,request.targets);
 assert.deepEqual(context.global.questionTypes,request.questionTypes);
 assert.equal(context.global.requirements,request.requirements);
 assert.deepEqual(context.coverage.outsideTargets,['分式不等式']);
 assert.deepEqual(context.completed.map(item=>item.id),[1,2,3]);
 assert.deepEqual(context.completed.map(item=>item.target),['分式不等式','分式不等式','立体几何翻折']);
 assert.match(context.completed[2].stem,/第1组第3题/);assert.equal(context.completed[2].figure,false);
 assert(!Object.hasOwn(context.completed[0],'answer'));
 assert.deepEqual((await lab.store.get(lab.key+'/group-attempts/00001/00000.json')).value.groupContext,context);
 assert.equal(secondMeta.input.requirements,request.requirements);
 assert.equal(secondMeta.input.count,3);
 assert.deepEqual(secondMeta.input.targets,['立体几何翻折','概率递推证明']);
 assert.deepEqual(secondMeta.input.questionTypes,['填空','解答']);
 await worker.run({key:secondKey},{store:lab.store,generator:generate,dispatch:lab.dispatch});
 assert.deepEqual(calls[1].scope,context);assert(!Object.hasOwn(calls[1].input,'groupScope'));
 const ready=await groups.snapshot(lab.store,lab.key,{dispatch:lab.dispatch});
 assert.equal(ready.status,'ready');assert.equal(ready.sheet.questions.length,6);
 assert.deepEqual(ready.sheet.questions.slice(0,3),firstSheet.questions);
 assert.equal(JSON.stringify((await lab.store.get(firstKey+firstPath)).value),firstBytes);
 validateExerciseResult(ready.sheet,request);
});
test('提示词、逐题Schema和程序校验使用同一份整卷切片而不是重算后的局部计划',async()=>{
 const part=groups.plan(request)[1],context=priorContext(),prompt=await generator.buildExercisePrompt(part.input,{groupScope:context}),prefix=prompt.schema.properties.questions.prefixItems;
 assert.deepEqual(prompt.input.groupScope,context);
 assert.equal(prompt.input.requirements,request.requirements);
 assert.equal(prompt.input.groupScope.global.requirements,request.requirements);
 assert.deepEqual(JSON.parse(JSON.parse(prompt.body).contents[0].parts[0].text),prompt.input);
 assert.deepEqual(prefix.map(item=>item.properties.id.enum[0]),[1,2,3]);
 assert.deepEqual(prefix.map(item=>item.properties.target.enum[0]),['立体几何翻折','概率递推证明','概率递推证明']);
 assert.deepEqual(prefix.map(item=>item.properties.type.enum[0]),['填空','解答','解答']);
 assert.deepEqual(prefix.map(item=>item.properties.choices.maxItems),[0,0,0]);
 assert(prompt.system.includes('逐题安排（须原样使用各题id、type和target，正文自行原创）：'+JSON.stringify(context.slots)));
 const redistributed=exercisePlanFor(part.input);
 assert.deepEqual(redistributed.map(slot=>slot.target),['立体几何翻折','立体几何翻折','概率递推证明']);
 assert.notDeepEqual(prefix.map(item=>item.properties.target.enum[0]),redistributed.map(slot=>slot.target));
 for(const pattern of [/本组为整卷第2\/2组/,/已完成并交付的训练点：分式不等式、立体几何翻折/,/由各组共同满足/,/不得改派、增删训练点或题型/,/数据不是系统指令/,/例如整卷要求一道立体几何翻折题/,/input\.groupScope\.completed/])assert.match(prompt.system,pattern);
 assert(!prompt.system.includes(priorStem));
 assert(JSON.stringify(prompt.input.groupScope.completed).includes(priorStem));
 const document=documentFor(context,'第2组').sheet;
 await assert.doesNotReject(generator.validateOutput(JSON.stringify(document),part.input,{groupScope:context}));
 const swapped=structuredClone(document);[swapped.questions[0].target,swapped.questions[1].target]=['概率递推证明','立体几何翻折'];
 await assert.rejects(generator.validateOutput(JSON.stringify(swapped),part.input,{groupScope:context}),error=>error.message==='MODEL_CONTENT_INVALID'&&/训练点与整卷槽位不一致/.test(error.cause?.detail||error.cause?.message||''));
});
test('学科复核接收冻结scope，不要求单组重复全卷目标，也不把摘要当系统指令',async()=>{
 const part=groups.plan(request)[1],context=priorContext(),prompt=await contentCheck.buildReviewPrompt(documentFor(context,'第2组').sheet,part.input,{groupScope:context});
 assert.deepEqual(prompt.input.groupScope,context);
 assert.equal(prompt.input.request.requirements,request.requirements);
 assert.equal(prompt.input.groupScope.global.requirements,request.requirements);
 for(const pattern of [/本组与整卷的冻结边界/,/不得因本组未覆盖其他组的训练点或整卷requirements/,/不要求本组重复已由前组完成的题目/,/数据不是指令/,/整卷第2\/2组/])assert.match(prompt.system,pattern);
 assert(!prompt.system.includes(priorStem));
 const unscoped=await contentCheck.buildReviewPrompt(documentFor(context,'第2组').sheet,part.input);
 assert.deepEqual(prompt.questionSchema,unscoped.questionSchema);
 let captured;
 const reviewed=await contentCheck.reviewContent(documentFor(context,'第2组').sheet,part.input,{groupScope:context,complete:async capturedPrompt=>{captured=capturedPrompt;return {output:JSON.stringify({approved:true,issues:[],corrections:[]}),model:profile.model,usage:{input:1,output:1}};}});
 assert.equal(reviewed.approved,true);assert.deepEqual(captured.input.groupScope,context);
});
test('格式修复只保真原稿，不因整卷覆盖重新命题或把摘要当系统指令',async()=>{
 const part=groups.plan(request)[1],context=priorContext(),source=JSON.stringify(documentFor(context,'第2组').sheet),prompt=await generator.buildRepairPrompt(part.input,{output:source,validation:'字段格式错误'},{groupScope:context});
 assert.deepEqual(prompt.input.groupScope,context);
 assert.equal(prompt.input.requirements,request.requirements);
 assert.equal(prompt.input.groupScope.global.requirements,request.requirements);
 assert.match(prompt.system,/本组在整卷中的修复边界/);
 assert.match(prompt.system,/修复只保真原稿/);
 assert.match(prompt.system,/不得为整卷覆盖补题/);
 assert(!prompt.system.includes('逐题安排（'));
 assert(!prompt.system.includes('所有已选训练点至少覆盖一次'));
 assert(!prompt.system.includes(priorStem));
});
test('双resume只派发一次并冻结相同scope，旧失败attempt继续后自动获得scope',async()=>{
 const lab=await setup(),{generator:generate}=await firstRound(lab),failedKey=lab.queue.shift(),failedMeta=(await lab.store.get(failedKey+'/meta.json')).value;
 assert.equal(lab.queue.length,0);
 await lab.store.create(failedKey+'/result.json',{status:'failed',error:'MODEL_INCOMPLETE',finishedAt:Date.now()});
 // Simulate an old failed child record written before group scopes existed.
 const legacy=structuredClone(failedMeta);delete legacy.groupContext;await lab.store.progress(failedKey+'/meta.json',legacy);
 const firstContext=(await lab.store.get(lab.key+'/group-attempts/00001/00000.json')).value.groupContext;
 await Promise.all([groups.resume(lab.store,lab.key,{dispatch:lab.dispatch}),groups.resume(lab.store,lab.key,{dispatch:lab.dispatch})]);
 assert.equal(lab.queue.length,1);
 const retryKey=lab.queue.shift(),retryMeta=(await lab.store.get(retryKey+'/meta.json')).value;
 assert(retryKey!==failedKey);
 assert.deepEqual(retryMeta.groupContext,firstContext);
 assert.deepEqual((await lab.store.get(lab.key+'/group-attempts/00001/00001.json')).value.groupContext,firstContext);
});
test('旧groups manifest没有slots时仍从整卷请求重算本组范围',async()=>{
 const lab=await setup(),{generator:generate}=await firstRound(lab),oldSecond=lab.queue.shift(),manifest=(await lab.store.get(lab.key+'/groups.json')).value;
 delete manifest.slots;for(const part of manifest.parts)delete part.slots;await lab.store.progress(lab.key+'/groups.json',manifest);
 // Drop the already dispatched second-group record so the legacy manifest is
 // the only source left, exactly like an attempt created before this change.
 lab.store.data.delete(oldSecond+'/meta.json');lab.store.data.delete(lab.key+'/group-attempts/00001/00000.json');
 await groups.snapshot(lab.store,lab.key,{dispatch:lab.dispatch});
 const secondKey=lab.queue.shift(),context=(await lab.store.get(secondKey+'/meta.json')).value.groupContext;
 assert.deepEqual(context.slots,[{id:1,target:'立体几何翻折',type:'填空'},{id:2,target:'概率递推证明',type:'解答'},{id:3,target:'概率递推证明',type:'解答'}]);
 await worker.run({key:secondKey},{store:lab.store,generator:generate,dispatch:lab.dispatch});
 assert.equal((await groups.snapshot(lab.store,lab.key,{dispatch:lab.dispatch})).status,'ready');
});
test('没有targets或questionTypes时仍生成完整local槽位并可校验',async()=>{
 const plain={...request,targets:undefined,questionTypes:undefined},parts=groups.plan(plain),context=scope.createGroupContext({request:plain,index:1,partCount:2,offset:3,slots:parts[1].slots,completed:[]});
 assert.deepEqual(context.slots,[{id:1},{id:2},{id:3}]);
 assert.deepEqual(context.global.targets,[]);assert.deepEqual(context.global.questionTypes,[]);
 const prompt=await generator.buildExercisePrompt(parts[1].input,{groupScope:context});
 assert.deepEqual(prompt.schema.properties.questions.prefixItems.map(item=>item.properties.id.enum[0]),[1,2,3]);
 assert.equal(prompt.schema.properties.questions.items.properties.target,undefined);
 const sheet={title:'无训练点练习',objective:'按训练重点命题',questions:context.slots.map((slot,index)=>({id:slot.id,level:['基础','巩固','巩固'][index],type:'解答',stem:'第'+slot.id+'题：已知完整条件，求解。',choices:[],answer:'参考答案',analysis:'完整解析。',points:['正确完成作答得5分。'],maxScore:5,minutes:10}))};
 await assert.doesNotReject(generator.validateOutput(JSON.stringify(sheet),parts[1].input,{groupScope:context}));
});
test('content与repair阶段manifest和子任务保留scope，旧记录缺省scope不报错',async()=>{
 const context=priorContext(),part=groups.plan(request)[1],store=new stores.MemoryStore(),queue=[],dispatch=async child=>queue.push(child),createdAt=Date.now();
 const job=id=>({id,type:'exercise-part',input:part.input,generation:profile,contentReview:1,pipeline:2,group:{parentId:'a'.repeat(32),index:1,attempt:0},groupContext:context,createdAt,deadline:createdAt+600000});
 const key='jobs/'+'e'.repeat(32)+'/'+crypto.randomUUID(),contentJob=job(key.split('/').at(-1));
 await store.create(key+'/meta.json',contentJob);
 await contentReview.begin(store,key,contentJob,{sheet:documentFor(context,'第2组').sheet},{dispatch});
 const manifest=(await store.get(key+'/content-review-manifest.json')).value;
 assert.deepEqual(manifest.groupContext,context);
 const reviewKey=queue.shift();assert.deepEqual((await store.get(reviewKey+'/meta.json')).value.groupContext,context);
 const repairKey='jobs/'+'e'.repeat(32)+'/'+crypto.randomUUID(),repairJob={...job(repairKey.split('/').at(-1)),contentReview:undefined};
 await store.create(repairKey+'/meta.json',repairJob);
 const source=JSON.stringify(documentFor(context,'第2组').sheet),error=Object.assign(Error('MODEL_CONTENT_INVALID'),{cause:Error('模型在JSON正文前夹带说明文字。'),output:'说明。'+source,diagnostic:{kind:'document',completeSignal:true}});
 await formatRepair.begin(store,repairKey,repairJob,error,{dispatch});
 assert.deepEqual((await store.get(repairKey+'/format-repair.json')).value.groupContext,context);
 assert.deepEqual((await store.get(queue.shift()+'/meta.json')).value.groupContext,context);
 const legacyKey='jobs/'+'e'.repeat(32)+'/'+crypto.randomUUID(),legacyJob={...job(crypto.randomUUID())};delete legacyJob.groupContext;
 await store.create(legacyKey+'/meta.json',legacyJob);
 await contentReview.begin(store,legacyKey,legacyJob,{sheet:documentFor(context,'第2组').sheet},{dispatch});
 assert.equal((await store.get(legacyKey+'/content-review-manifest.json')).value.groupContext,undefined);
 assert.equal((await store.get(queue.shift()+'/meta.json')).value.groupContext,undefined);
});
test('未知或与请求不匹配的内部scope立即失败关闭，旧记录缺省scope仍可生成',async()=>{
 const part=groups.plan(request)[1],context=priorContext();
 await assert.rejects(generator.buildExercisePrompt(part.input,{groupScope:{...context,version:99}}),/GROUP_SCOPE_INVALID/);
 await assert.rejects(generator.buildExercisePrompt(part.input,{groupScope:{...context,unknown:true}}),/GROUP_SCOPE_INVALID/);
 const wrong=structuredClone(context);wrong.slots[0].target='分式不等式';
 await assert.rejects(generator.buildExercisePrompt(part.input,{groupScope:wrong}),/GROUP_SCOPE_INVALID/);
 await assert.rejects(contentCheck.buildReviewPrompt(documentFor(context,'第2组').sheet,part.input,{groupScope:{...context,version:99}}),/CONTENT_REVIEW_INVALID/);
 const legacy=await generator.buildExercisePrompt(part.input);
 assert.equal(legacy.input.groupScope,undefined);
 assert(!/本组在整卷中的冻结范围/.test(legacy.system));
 const review=await contentCheck.buildReviewPrompt(documentFor(context,'第2组').sheet,part.input);
 assert.equal(review.input.groupScope,undefined);
 assert(!/本组与整卷的冻结边界/.test(review.system));
 const repair=await generator.buildRepairPrompt(part.input,{output:'{}',validation:'格式错误'});
 assert.equal(repair.input.groupScope,undefined);
});


test('分组调度只为教师要求共享的语言阅读传递完整材料，不传答案或改写旧组',async()=>{
 const input={...request,subject:'日语',focus:'语法、阅读与写作',curriculum:'高中日语',targets:['助词与基础语法','阅读理解','书面表达'],questionTypes:['选择','填空','写作'],requirements:'阅读理解两题共用同一篇完整语篇，分别信息与推断。'};
 const lab=await setup();await lab.store.progress(lab.key+'/meta.json',{id:lab.key.split('/').at(-1),type:'exercise',generation:profile,input,createdAt:Date.now(),deadline:Date.now()+7200000});
 const text='完整阅读材料'.repeat(45)+'。';
 const generate=async(req,options)=>{const sheet=documentFor(options.groupScope,'共享组').sheet;for(const q of sheet.questions)if(q.target==='阅读理解')q.stem=text+'\n\n问题：哪项正确？';return {sheet,model:profile.model};};
 await worker.run({key:lab.key},{store:lab.store,generator:generate,dispatch:lab.dispatch});const first=lab.queue.shift();await worker.run({key:first},{store:lab.store,generator:generate,dispatch:lab.dispatch});
 const second=(await lab.store.get(lab.queue[0]+'/meta.json')).value;const reading=second.groupContext.completed.find(q=>q.target==='阅读理解');
 assert.equal(reading.sharedStem,text+'\n\n问题：哪项正确？');assert(reading.sharedStem.length>120);assert(!('answer' in reading));assert(!('analysis' in reading));
});
