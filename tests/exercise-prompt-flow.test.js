import test from 'node:test';
import assert from 'node:assert/strict';
import {exerciseKeepPromptTogether,exercisePrintSections,exerciseAnswerSpaceHeight} from '../app/engine/exercise-print.js';
test('共享阅读后的英文选择题与四项整体排版，不把整篇材料锁成大块',()=>{
 const passage=('A full original reading passage about a school project. ').repeat(25)+'\n\n',choices=['The cost of the proposed equipment.','The operation of the new machine.','The need for student participation.','The availability of qualified staff.'],q={id:1,type:'选择',stem:passage+'Why was the teacher initially hesitant?',choices},q2={...q,id:2,stem:passage+'What can be inferred from her response?'};
 assert.equal(exerciseKeepPromptTogether(q),false);const section=exercisePrintSections([q,q2])[0];assert.equal(section.material,passage);assert(section.questions.every(exerciseKeepPromptTogether));assert.equal(exerciseAnswerSpaceHeight(q,'英语'),6);
});
test('长语篇、多行题与含图题不强行整题锁页，普通短设问可整体排版',()=>{
 assert(exerciseKeepPromptTogether({stem:'请按材料解释原因。',choices:[]}));assert(!exerciseKeepPromptTogether({stem:'文'.repeat(650),choices:[]}));assert(!exerciseKeepPromptTogether({stem:'行\n'.repeat(18),choices:[]}));assert(!exerciseKeepPromptTogether({stem:'如图所示。',choices:[],diagram:{kind:'plot'}}));
});
