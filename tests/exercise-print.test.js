import test from 'node:test';import assert from 'node:assert/strict';
import {exercisePrintSections} from '../app/engine/exercise-print.js';
test('长阅读共同材料只印一次，每道题可无损还原，原题及编号不改变',()=>{
 const material='阅读下面的材料。\n'+('原始材料的完整段落。'.repeat(30))+'\n\n',questions=[1,2,3].map(id=>({id,stem:material+'第'+id+'道问题？',answer:'答案'+id})),before=structuredClone(questions),sections=exercisePrintSections(questions);
 assert.equal(sections.length,1);assert.equal(sections[0].material,material);for(const q of sections[0].questions)assert.equal(sections[0].material+q.stem,questions[q.id-1].stem);assert.deepEqual(questions,before);
});
test('不同材料、短通用提示和不完整段落不合并；仅合并连续题组',()=>{
 const material='完整第一材料。'.repeat(40)+'\n\n',other='完整第二材料。'.repeat(40)+'\n\n';
 const sections=exercisePrintSections([{id:1,stem:material+'甲问'},{id:2,stem:material+'乙问'},{id:3,stem:other+'丙问'},{id:4,stem:other+'丁问'},{id:5,stem:material+'戊问'}]);assert.deepEqual(sections.map(s=>s.questions.map(q=>q.id)),[[1,2],[3,4],[5]]);
 for(const prefix of ['阅读下面的文字。\n','同样的前缀'.repeat(80)])assert.equal(exercisePrintSections([{stem:prefix+'甲'},{stem:prefix+'乙'}]).length,2);
});
