import test from 'node:test';
import assert from 'node:assert/strict';
import groups from '../backend/exercise-groups.cjs';
import scope from '../backend/exercise-group-scope.cjs';
import generator from '../backend/generator.cjs';

const whole={subject:'数学',grade:'高三',curriculum:'高中数学已学课程',focus:'不等式、立体几何、概率递推',targets:['不等式','立体几何','概率递推'],questionTypes:['解答'],count:6,minutes:50,difficulty:'综合提升',evidence:[],visuals:'auto'};
function fixture(requirements){
 const request={...whole,...(requirements===undefined?{}:{requirements})},part=groups.plan(request)[1];
 return {input:part.input,context:scope.createGroupContext({request,index:1,partCount:2,offset:3,slots:part.slots})};
}
test('空补充要求和未填写补充要求保持原样通过分组命题',async()=>{
 for(const requirements of [undefined,'','  ']){
  const {input,context}=fixture(requirements),prompt=await generator.buildExercisePrompt(input,{groupScope:context,separateFigures:true});
  assert.equal(prompt.input.requirements,requirements);assert.equal(prompt.input.groupScope.global.requirements,requirements);
 }
});
test('同样属于已选知识点的错误分配也不能冒充整卷计划切片',()=>{
 const {input,context}=fixture();
 const wrong=structuredClone(context);wrong.slots[1].target='立体几何';
 assert.throws(()=>scope.normalizeGroupScope(wrong,{count:3,request:input}),/GROUP_SCOPE_INVALID/);
});
test('冻结的整卷范围缺少或改变原要求时在调用模型前停止',async()=>{
 const {input,context}=fixture('必须包含精确的立体翻折示意图。');
 for(const key of ['subject','grade','curriculum','focus','difficulty','requirements'])for(const mode of ['missing','changed']){
  const wrong=structuredClone(context);if(mode==='missing')delete wrong.global[key];else wrong.global[key]+='变更';
  await assert.rejects(generator.buildExercisePrompt(input,{groupScope:wrong}),/GROUP_SCOPE_INVALID/);
 }
 for(const [key,value] of [['minutes',0],['minutes',91],['count',13]]){
  const wrong=structuredClone(context);wrong.global[key]=value;
  assert.throws(()=>scope.normalizeGroupScope(wrong,{count:3,request:input}),/GROUP_SCOPE_INVALID/);
 }
});
test('局部请求未包含冻结槽位的训练点时不进入Schema构造',async()=>{
 const {input,context}=fixture(),wrong=structuredClone(input);delete wrong.targets;
 await assert.rejects(generator.buildExercisePrompt(wrong,{groupScope:context}),/GROUP_SCOPE_INVALID/);
});
