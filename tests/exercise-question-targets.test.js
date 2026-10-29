import test from 'node:test';
import assert from 'node:assert/strict';
import {validateExerciseRequest,validateExerciseResult,exercisePlanFor,exerciseSchemaFor} from '../app/engine/exercise-contract.js';
import {perQuestionExerciseRequest,setExerciseQuestionTarget,setExerciseQuestionType,resizeExercisePlan,exerciseTargetPool} from '../app/engine/exercise-question-plan.js';
import {auditExerciseQuality} from '../app/engine/exercise-quality.js';
import {exerciseSetupContent,applyExerciseSetup} from '../app/engine/exercise-setups.js';
import groups from '../backend/exercise-groups.cjs';
import scope from '../backend/exercise-group-scope.cjs';
import generator from '../backend/generator.cjs';
const input={subject:'数学',grade:'高三',curriculum:'已学集合与函数',focus:'按逐题知识点安排训练',count:6,minutes:30,difficulty:'基础巩固',visuals:'none',evidence:[],targetMode:'per-question',targets:['交集','并集','补集','函数定义域','函数奇偶性','导数','椭圆','概率'],questionTypes:[],questionPlan:[{id:1,target:'交集',type:'填空'},{id:2,target:'交集',type:'填空'},{id:3,target:'并集',type:'填空'},{id:4},{id:5,target:'交集'},{id:6,target:'并集'}]};
test('知识点由题号独立指定，可重复，候选点数不再决定题数',()=>{
 validateExerciseRequest(input);const plan=exercisePlanFor(input);assert.deepEqual(plan.map(s=>s.target),['交集','交集','并集',undefined,'交集','并集']);assert.deepEqual(exerciseSchemaFor(input).properties.questions.prefixItems[1].properties.target.enum,['交集']);assert.deepEqual(exerciseSchemaFor(input).properties.questions.prefixItems[3].properties.target.enum,input.targets);
 const sheet={title:'专项练习',objective:'按逐题知识点训练',questions:plan.map((s,i)=>({id:i+1,type:'填空',target:s.target||'并集',level:'基础',stem:'第'+(i+1)+'题求集合运算的结果。',choices:[],answer:'结果',analysis:'根据定义计算。',points:['结果正确得5分'],maxScore:5,minutes:5}))};validateExerciseResult(sheet,input);assert(!auditExerciseQuality(sheet,input).issues.some(i=>i.code==='coverage'));sheet.questions[1].target='并集';assert.throws(()=>validateExerciseResult(sheet,input),/第2题未使用该题指定的知识点/);
 assert.throws(()=>validateExerciseRequest({...input,targetMode:undefined}),/训练点|安排/);
});
test('逐题知识点与题型修改互不覆盖，缩减与模板保留真实安排',()=>{
 let r=setExerciseQuestionTarget(input,3,'函数定义域');r=setExerciseQuestionType(r,3,'选择');assert.equal(r.questionPlan[3].target,'函数定义域');r=setExerciseQuestionType(r,3,'auto');assert.equal(r.questionPlan[3].target,'函数定义域');assert.equal(r.questionPlan[3].type,undefined);
 const small=resizeExercisePlan(r,3);assert.deepEqual(small.map(s=>s.target),['交集','交集','并集']);assert(!exerciseTargetPool(r,small).includes('函数定义域'));assert.deepEqual(resizeExercisePlan(r,8).slice(6),[{id:7},{id:8}]);assert.deepEqual(applyExerciseSetup({content:exerciseSetupContent(r)},input).questionPlan,r.questionPlan);
 const old={...input,targets:['交集','并集'],questionTypes:['选择','填空']};delete old.targetMode;delete old.questionPlan;const migrated=perQuestionExerciseRequest(old);assert.deepEqual(migrated.questionPlan,exercisePlanFor(old));assert.deepEqual(migrated.questionTypes,[]);
});
test('逐题知识点在6至12题分组中不重分配，自动槽位保留完整候选池',async()=>{
 for(let count=6;count<=12;count++){
  const request={...input,count,questionPlan:resizeExercisePlan(input,count)},parts=groups.plan(request);assert.deepEqual(scope.globalSlots(request),exercisePlanFor(request));
  for(const part of parts){validateExerciseRequest(part.input);assert.deepEqual(part.input.targets,input.targets);const frozen=scope.createGroupContext({request,index:part.index,partCount:parts.length,offset:part.offset,slots:part.slots});scope.normalizeGroupScope(frozen,{request:part.input,count:part.input.count});const prompt=await generator.buildExercisePrompt(part.input,{groupScope:frozen});assert.match(prompt.system,/不要求全部覆盖|不要求把候选点全部覆盖/);for(const slot of part.slots)if(slot.target)assert.deepEqual(prompt.schema.properties.questions.prefixItems[slot.id-1].properties.target.enum,[slot.target]);}
 }
 const legacy={...input,targets:['交集','并集']};delete legacy.targetMode;legacy.questionPlan=legacy.questionPlan.map(({id,type})=>({id,...(type?{type}:{})}));assert.deepEqual(scope.globalSlots(legacy,3),scope.globalSlots(legacy,4));
});
