import test from 'node:test';
import assert from 'node:assert/strict';
import {exercisePlanFor} from '../app/engine/exercise-contract.js';
import scope from '../backend/exercise-group-scope.cjs';
import groups from '../backend/exercise-groups.cjs';
import generator from '../backend/generator.cjs';
const request={subject:'日语',grade:'高三',curriculum:'高中日语课程',focus:'语法、阅读和表达',count:6,minutes:65,difficulty:'方法进阶',targets:['助词与基础语法','阅读理解','书面表达'],questionTypes:['选择','填空','写作'],visuals:'none',evidence:[]};

test('日语语法、阅读和写作匹配已选题型，不按两个数组相同位置强行对应',()=>{
 const expected=['填空','填空','选择','选择','写作','写作'];
 assert.deepEqual(exercisePlanFor(request).map(x=>x.type),expected);
 assert.deepEqual(scope.globalSlots(request),exercisePlanFor(request));
 assert.deepEqual(exercisePlanFor({...request,questionTypes:['写作','选择','填空']}).map(x=>x.type),expected);
});
test('语文文言翻译与简明改写分配简答，阅读仍能覆盖选择和概括任务',async()=>{
 const input={...request,subject:'语文',curriculum:'高中语文课程',focus:'阅读、翻译和改写',minutes:45,targets:['信息筛选整合','文言翻译','语言简明改写'],questionTypes:['选择','简答']};
 assert.deepEqual(exercisePlanFor(input).map(x=>x.type),['选择','简答','简答','简答','简答','简答']);
 for(const part of groups.plan(input)){
  const context=scope.createGroupContext({request:input,index:part.index,partCount:2,offset:part.offset,slots:part.slots});
  const prompt=await generator.buildExercisePrompt(part.input,{groupScope:context});
  assert.deepEqual(prompt.schema.properties.questions.prefixItems.map(x=>x.properties.type.enum[0]),part.slots.map(x=>x.type));
 }
});
test('旧语言题组保留版本一冻结计划，升级不能将已付费题组按新规则改派',()=>{
 const old=scope.globalSlots(request,1),slots=scope.localSlots(old,0,3);
 assert.deepEqual(old.map(x=>x.type),['选择','选择','填空','填空','写作','写作']);
 const context=scope.createGroupContext({request,index:0,partCount:2,offset:0,slots,planVersion:1});
 const input={...request,count:3,minutes:32,targets:['助词与基础语法','阅读理解'],questionTypes:['选择','填空']};
 assert.equal(scope.normalizeGroupScope(context,{count:3,request:input}).version,1);
 assert.throws(()=>scope.normalizeGroupScope({...context,version:2},{count:3,request:input}),/GROUP_SCOPE_INVALID/);
});
test('前后端语言计划在各种题数下一致，未知目标及未选择类型不被臆造',()=>{
 for(const count of [3,4,5,6,7,8,9,10,11,12])for(const subject of ['语文','英语','日语']){
  const input={...request,subject,count,targets:subject==='语文'?['信息筛选整合','文言翻译','语言简明改写']:request.targets,questionTypes:subject==='语文'?['选择','简答']:request.questionTypes};
  const slots=exercisePlanFor(input);assert.deepEqual(slots,scope.globalSlots(input));
  for(const type of input.questionTypes)assert(slots.some(x=>x.type===type));
  for(const slot of slots){assert(input.questionTypes.includes(slot.type));assert(input.targets.includes(slot.target));}
 }
 const unknown={...request,targets:['教师自定目标甲','教师自定目标乙']};
 assert.deepEqual(exercisePlanFor(unknown),scope.globalSlots(unknown,1));
 assert(exercisePlanFor({...request,questionTypes:['选择']}).every(x=>x.type==='选择'));
});


test('跨组共享阅读保留完整题干而不带答案，并校验有界数据与衔接提示',()=>{
 const stem='完整阅读材料。'.repeat(30)+'\n\n本文から考えられることは何ですか。';
 const q={id:3,target:'阅读理解',type:'选择',level:'巩固',stem,answer:'A',analysis:'不可转发答案'};
 const bounded=scope.questionSummary(q,3),shared=scope.questionSummary(q,3,{shareReading:true});
 assert.equal(bounded.stem.length,120);assert(!('sharedStem' in bounded));assert.equal(shared.sharedStem,stem);assert(!('answer' in shared));assert(!('analysis' in shared));
 const slots=scope.localSlots(scope.globalSlots(request),3,3);
 const context=scope.createGroupContext({request,index:1,partCount:2,offset:3,slots,completed:[shared]});
 assert.equal(scope.normalizeGroupScope(context).completed[0].sharedStem,stem);
 assert.match(scope.scopeSection(context),/仅原样复用其中的阅读材料/);assert.match(scope.scopeSection(context,{stage:'review'}),/信息题和推断题/);
 assert.throws(()=>scope.normalizeGroupScope({...context,completed:[{...shared,sharedStem:'x'.repeat(scope.MAX_SHARED_STEM+1)}]}),/GROUP_SCOPE_INVALID/);
 assert.throws(()=>scope.normalizeGroupScope({...context,completed:[{...shared,target:'助词与基础语法'}],coverage:{...context.coverage,completedTargets:['助词与基础语法']}}),/GROUP_SCOPE_INVALID/);
 assert(!('sharedStem' in scope.questionSummary({...q,diagram:{kind:'plot'}},3,{shareReading:true})));
 assert(!('sharedStem' in scope.questionSummary({...q,stem:'x'.repeat(scope.MAX_SHARED_STEM+1)},3,{shareReading:true})));
});
