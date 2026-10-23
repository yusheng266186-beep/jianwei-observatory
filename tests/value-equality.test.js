import test from 'node:test';
import assert from 'node:assert/strict';
import {sameJSONValue} from '../app/engine/value-equality.js';
import {exerciseRecordSnapshot,exerciseRecordsUnchanged,mergeExerciseRecords,settleExerciseRecords} from '../app/engine/exercise-records.js';
test('JSON comparison preserves persisted meaning without serializing full sheets',()=>{
 const sheet={questions:[{stem:'题干'.repeat(1000),answer:'2',points:['条件','结论']}],missing:undefined};
 assert(sameJSONValue(sheet,structuredClone(sheet)));
 assert(sameJSONValue({a:1,b:undefined},{a:1}));assert(sameJSONValue([undefined,,NaN],[null,null,null]));
 assert(sameJSONValue({a:1,b:2},{b:2,a:1}));assert(!sameJSONValue([1,2],[2,1]));assert(!sameJSONValue({a:null},{}));assert(!sameJSONValue('2',2));
 const changed=structuredClone(sheet);changed.questions[0].points.push('新条件');assert(!sameJSONValue(sheet,changed));
});
test('unchanged exercise saves reuse the baseline but observe remote edits and removals',()=>{
 const live=[{id:'a',status:'ready',request:{subject:'数学'},sheet:{questions:[{stem:'原题',answer:'2'}]}}],baseline=exerciseRecordSnapshot(live);
 live[0].progress={sequence:9};live[0].generationLog={outputText:'在途正文'};assert(exerciseRecordsUnchanged(live,baseline));
 const remote=structuredClone(baseline);remote[0].sheet.questions[0].answer='3';remote.push({id:'new',status:'queued'});
 assert.equal(mergeExerciseRecords(baseline,baseline,remote),remote);
 assert.deepEqual(mergeExerciseRecords(baseline,baseline,remote,{removed:['a']}),[remote[1]]);
 const settled=settleExerciseRecords(live,baseline,remote);assert.equal(settled.rows[0],live[0]);assert.equal(live[0].sheet.questions[0].answer,'3');assert.equal(live[0].generationLog.outputText,'在途正文');
 assert(!exerciseRecordsUnchanged(settled.rows,baseline));
});
test('new edits while an unchanged save is reading remain dirty for the next save',()=>{
 const live=[{id:'a',sheet:{questions:[{stem:'原题',answer:'2'}]}}],base=exerciseRecordSnapshot(live),captured=base;
 live[0].sheet.questions[0].answer='保存期间输入';
 assert(!exerciseRecordsUnchanged(live,base));
 const result=settleExerciseRecords(live,captured,structuredClone(base));assert.equal(result.rows[0].sheet.questions[0].answer,'保存期间输入');assert(!exerciseRecordsUnchanged(result.rows,result.baseline));
});
