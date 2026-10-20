import test from 'node:test';import assert from 'node:assert/strict';
import {exercisePrintSections,exerciseAnswerSpaceHeight,exerciseAnswerSpaceParts} from '../app/engine/exercise-print.js';
test('化学多小问填空没有内嵌作答空位时保留紧凑书写区，语篇空格和选择仍紧凑',async()=>{
 const {exerciseObjectiveQuestion}=await import('../app/engine/exercise-print.js');
 const q={type:'填空',answerLines:0,stem:'某酯完全水解生成甲醇和丙酸。\n（1）写出X的结构简式。\n（2）写出碱性水解的化学方程式。\n（3）说明区分异构体与X时的现象。'};
 assert.equal(exerciseAnswerSpaceHeight(q,'化学'),54);assert.equal(exerciseObjectiveQuestion(q),false);
 const inline={...q,stem:q.stem+'\n填写在____处。'};assert.equal(exerciseAnswerSpaceHeight(inline,'化学'),10);assert(exerciseObjectiveQuestion(inline));
 assert.equal(exerciseAnswerSpaceHeight({...q,type:'选择',answerLines:40},'化学'),6);
 const {wordAnswerSpaceParagraphs}=await import('../app/io/exercise-word.js');const word=wordAnswerSpaceParagraphs(q,'化学');assert.equal((word.match(/w:pStyle/g)||[]).length,3);assert(!word.includes('w:pBdr'));
});
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


test('教师解析和评分标题在页尾先换页，普通正文仍可自由流动，短题不引入强制分页',async()=>{
 const {exercisePageBreakBefore}=await import('../app/engine/exercise-print.js');
 for(const id of ['exercise-question-2','exercise-section-analysis-1','exercise-section-points-1']){assert.equal(exercisePageBreakBefore({id,startPosition:{top:760}}),true);assert.equal(exercisePageBreakBefore({id,startPosition:{top:80}}),false);}
 assert.equal(exercisePageBreakBefore({text:'继续的正文',startPosition:{top:760}}),false);
 assert.equal(exercisePageBreakBefore({id:'exercise-section-analysis-1'}),false);
});

test('教师有图题不把题干、选项和答案锁成整页大块，长答案可续页',async()=>{
 const {exerciseTeacherKeepPromptTogether,exerciseTeacherKeepAnswerTogether,exercisePrintLead}=await import('../app/engine/exercise-print.js');
 const diagram={id:1,type:'选择',stem:'某物体沿直线运动。'.repeat(20),choices:['甲项','乙项','丙项','丁项'],answer:'A',analysis:'解析。'.repeat(80),points:['选对得5分'],diagram:{kind:'plot'}};
 assert.equal(exerciseTeacherKeepPromptTogether(diagram),false);assert.equal(exerciseTeacherKeepAnswerTogether(diagram),false);
 const plain={...diagram,diagram:undefined,stem:'求物体到达右端的时间。',answer:'由运动学公式可得结果。'};
 assert.equal(exerciseTeacherKeepPromptTogether(plain),true);assert.equal(exerciseTeacherKeepAnswerTogether(plain),true);
 assert.equal(exerciseTeacherKeepAnswerTogether({...plain,answer:'解析。'.repeat(300)}),false);
 const answer='（1）由公式得第一问。\n（2）代入数据得第二问。\n（3）结论成立。',parts=exercisePrintLead(answer);
 assert.equal(parts.lead,'（1）由公式得第一问。');assert.equal(parts.lead+'\n'+parts.rest,answer);
 assert.deepEqual(exercisePrintLead('A'),{lead:'A',rest:''});
 const table='| I/A | 0.100 |\n| --- | --- |\n| U/V | 0.200 |';assert.deepEqual(exercisePrintLead(table),{lead:table,rest:''});
});

test('Word四选一的两行选项始终成对，题干仍可自由分页',async()=>{
 const {exerciseKeepPromptTogether,exerciseChoiceRowKeepNext}=await import('../app/engine/exercise-print.js');
 const diagram={type:'选择',stem:'长题干。'.repeat(120),choices:['甲项','乙项','丙项','丁项'],diagram:{kind:'plot'}};
 assert.equal(exerciseKeepPromptTogether(diagram),false);
 assert.equal(exerciseChoiceRowKeepNext(diagram,0),true);assert.equal(exerciseChoiceRowKeepNext(diagram,1),false);
 assert.equal(exerciseChoiceRowKeepNext({...diagram,choices:['甲项','乙项','丙项']},0),false);
});


test('答案首段保持时不切开跨行公式、混合公式或结构化表格',async()=>{
 const {exercisePrintLead,exerciseChoiceRowKeepNext}=await import('../app/engine/exercise-print.js');
 for(const source of [String.raw`先计算 $\begin{aligned}a&=1
b&=2\end{aligned}$
继续说明`, '先给数据：\n| A | B |\n| --- | --- |\n| 1 | 2 |'])assert.deepEqual(exercisePrintLead(source),{lead:source,rest:''});
 const q={choices:['A','B','C','D']};assert.deepEqual([0,1,2,3].map(i=>exerciseChoiceRowKeepNext(q,Math.floor(i/2))),[true,true,false,false]);
});


test('有图题的单列选项同样连排，长材料选项不被锁成整页大块',async()=>{
 const {exerciseChoiceKeepNext}=await import('../app/engine/exercise-print.js');
 const q={diagram:{kind:'plot'},choices:['0至2秒内加速度为2，0至7秒内位移为20。','0至2秒内加速度为4，0至7秒内位移为20。','0至2秒内加速度为2，0至7秒内位移为28。','5至7秒内物体做速度为零的匀速运动。']};
 assert.deepEqual(q.choices.map((_,i)=>exerciseChoiceKeepNext(q,i)),[true,true,true,false]);assert(q.choices.every(c=>exerciseChoiceKeepNext({...q,choices:q.choices.map(x=>x.repeat(50))},0)===false));
});
