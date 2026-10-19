import test from 'node:test';import assert from 'node:assert/strict';
import {exercisePrintSections,exerciseAnswerSpaceHeight,exerciseAnswerSpaceParts} from '../app/engine/exercise-print.js';
test('选择填空只保留小间隔，主观题采用逐题模型行数，不按题干长度分配',()=>{
 for(const type of ['选择','多选','填空'])assert(exerciseAnswerSpaceHeight({type,answerLines:40},'数学')<=10);
 assert.equal(exerciseAnswerSpaceHeight({type:'解答',answerLines:4},'数学'),72);assert.equal(exerciseAnswerSpaceHeight({type:'实验',answerLines:14},'化学'),252);
 const short={type:'简答',stem:'说明原因。',answer:'由光合作用原理可知，光照会影响反应速率。',points:['指出原理'],minutes:5};assert.equal(exerciseAnswerSpaceHeight(short,'生物'),exerciseAnswerSpaceHeight({...short,stem:'长材料。'.repeat(800)},'生物'));
 assert(exerciseAnswerSpaceHeight({...short,answer:'逐项分析。'.repeat(200)},'生物')>exerciseAnswerSpaceHeight(short,'生物'));
 assert.equal(exerciseAnswerSpaceHeight({type:'简答',stem:'Answer in no more than 20 words.'},'英语'),36);
 const q={...short,diagram:{kind:'plot'},answerLines:12},parts=exerciseAnswerSpaceParts(q,'生物');assert.equal(parts.minimum+parts.trailing,216);assert(parts.minimum>=60);
});
test('留白按手写行拆分，可跨页延续，不把整块作答区域与题干捆绑',async()=>{
 const {exerciseWritingRows}=await import('../app/engine/exercise-print.js');for(const size of [6,10,72,252,864]){const rows=exerciseWritingRows(size);assert(rows.every(r=>r>0&&r<=18));assert.equal(rows.reduce((a,b)=>a+b,0),size);}
});
test('长阅读共同材料只印一次，每道题可无损还原，原题及编号不改变',()=>{
 const material='阅读下面的材料。\n'+('原始材料的完整段落。'.repeat(30))+'\n\n',questions=[1,2,3].map(id=>({id,stem:material+'第'+id+'道问题？',answer:'答案'+id})),before=structuredClone(questions),sections=exercisePrintSections(questions);
 assert.equal(sections.length,1);assert.equal(sections[0].material,material);for(const q of sections[0].questions)assert.equal(sections[0].material+q.stem,questions[q.id-1].stem);assert.deepEqual(questions,before);
});
test('不同材料、短通用提示和不完整段落不合并；仅合并连续题组',()=>{
 const material='完整第一材料。'.repeat(40)+'\n\n',other='完整第二材料。'.repeat(40)+'\n\n';
 const sections=exercisePrintSections([{id:1,stem:material+'甲问'},{id:2,stem:material+'乙问'},{id:3,stem:other+'丙问'},{id:4,stem:other+'丁问'},{id:5,stem:material+'戊问'}]);assert.deepEqual(sections.map(s=>s.questions.map(q=>q.id)),[[1,2],[3,4],[5]]);
 for(const prefix of ['阅读下面的文字。\n','同样的前缀'.repeat(80)])assert.equal(exercisePrintSections([{stem:prefix+'甲'},{stem:prefix+'乙'}]).length,2);
});

test('Word短解答的适量留白随题干，不产生只有作答空行的末页；长留白仍可分页',async()=>{const {wordAnswerSpaceParagraphs}=await import('../app/io/exercise-word.js');const q={type:'解答',stem:'求通项并证明结论。',choices:[],answerLines:14};const short=wordAnswerSpaceParagraphs(q,'数学');assert.equal((short.match(/w:keepNext/g)||[]).length,13);assert.equal([...short.matchAll(/w:line="(\d+)"/g)].reduce((n,m)=>n+Number(m[1]),0),14*18*20);const long=wordAnswerSpaceParagraphs({...q,answerLines:48},'数学');assert(!long.includes('w:keepNext'));assert.equal((long.match(/w:pStyle/g)||[]).length,48);assert(!wordAnswerSpaceParagraphs({...q,stem:'完整长材料。'.repeat(300)},'数学').includes('w:keepNext'));});
