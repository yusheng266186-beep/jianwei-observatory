import test from 'node:test';
import assert from 'node:assert/strict';
import {exerciseFocusParts,toggleExerciseFocus} from '../app/ui/exercise-focus.js';
import {exercisePresets} from '../app/ui/exercise-presets.js';

test('every subject focus option can be selected and cancelled repeatedly',()=>{
 for(const subject of ['语文','数学','英语','物理','化学','生物']){
  const {modules,goals}=exercisePresets(subject),labels=[...modules,...goals];
  for(const label of labels){
   let focus='教师补充：保留分类讨论';
   for(let i=0;i<3;i++){
    focus=toggleExerciseFocus(focus,label,labels);
    assert.deepEqual(exerciseFocusParts(focus,labels),['教师补充：保留分类讨论',label],subject+': '+label);
    focus=toggleExerciseFocus(focus,label,labels);
    assert.equal(focus,'教师补充：保留分类讨论');
   }
  }
 }
});

test('compound labels, manual text and other selections survive cancellation',()=>{
 const label='条件、定义域与边界辨析',knowledge='函数、导数综合',labels=['条件',label,knowledge,'常规方法与计算训练'];
 const focus=' '+knowledge+' 、 '+label+' \r\n常规方法与计算训练\n保留分类讨论';
 assert.deepEqual(exerciseFocusParts(focus,labels),[knowledge,label,'常规方法与计算训练','保留分类讨论']);
 assert.equal(toggleExerciseFocus(focus,label,labels),knowledge+'、常规方法与计算训练、保留分类讨论');
 assert.equal(toggleExerciseFocus(focus,knowledge,labels),label+'、常规方法与计算训练、保留分类讨论');
});

test('cancelling a previously duplicated option removes all copies',()=>{
 const label='条件、定义域与边界辨析';
 assert.equal(toggleExerciseFocus('导数综合、'+label+'、'+label+'、教师补充',label), '导数综合、教师补充');
});

test('matching whole options does not mistake a custom sentence for selection',()=>{
 const label='条件、定义域与边界辨析';
 assert.equal(exerciseFocusParts('请加强'+label+'能力',[label]).includes(label),false);
 assert.deepEqual(exerciseFocusParts(' 自定甲、 自定乙 \n自定丙',[]),['自定甲','自定乙','自定丙']);
});
