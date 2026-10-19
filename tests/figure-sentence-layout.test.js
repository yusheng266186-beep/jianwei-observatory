import test from 'node:test';
import assert from 'node:assert/strict';
import {exerciseFigureParts} from '../app/engine/exercise-figure-layout.js';
import summaries from '../backend/validation-summary.cjs';
import format from '../backend/document-format.cjs';
const question=(stem,after)=>({id:1,stem,figureRequest:{placement:{after,width:'compact',aspect:'square'}}});
test('配图可插在唯一完整引图句后，保留同段内的后续常量与设问',()=>{
 const anchor='速度的 $v-t$ 图像如图所示。',tail='已知 $g=10$，下列说法正确的是（　）',q=question('物块做直线运动。'+anchor+tail,anchor),before=structuredClone(q),parts=exerciseFigureParts(q);
 assert.equal(parts.before,'物块做直线运动。'+anchor);assert.equal(parts.after,tail);assert.equal(parts.before+parts.after,q.stem);assert.deepEqual(q,before);
});
test('仍拒绝非句末、重复锚点、缺失锚点和公式内部位置',()=>{
 for(const q of [question('运动的速度随时间变化。','运动的速度'),question('如图所示。如图所示。','如图所示。'),question('没有图。','如图所示。'),question('$x。y$ 后续条件。','x。')])assert.throws(()=>exerciseFigureParts(q),/插入位置/);
});
test('真实生成引图锚点可包含段末换行，保持后续小问和原始题干不变',()=>{
 for(const ending of ['\n','\r\n','\n  ']){
  const anchor='将 $\\triangle CEB$ 沿 $CE$ 折起，使两平面垂直。'+ending,tail='（1）证明两直线垂直；\n（2）求二面角的余弦值。',q=question(anchor+tail,anchor),before=structuredClone(q),parts=exerciseFigureParts(q);
  assert.equal(parts.before,anchor);assert.equal(parts.after,tail);assert.equal(parts.before+parts.after,q.stem);assert.deepEqual(q,before);
 }
 assert.throws(()=>exerciseFigureParts(question('同一行的条件仍未结束。','同一行的条件 ')),/插入位置/);
});
test('模型提示明确引用目标句；配图失败显示具体原因且不泄露原始诊断',()=>{
 assert.match(format.documentFormatGuide('语文'),/在设问后逐字列出完整目标句/);
 assert.equal(summaries.validationSummary('第1题的图示插入位置与题干不一致，请重新确认图示位置。'),'第1题的配图位置与题干不匹配，请重新生成本组。');
 assert.match(summaries.validationSummary("Unexpected token '`', document is not valid JSON"),/Markdown代码围栏/);
 assert.match(summaries.validationSummary('第3题引用了未提供的图示。'),/第3题提及配图但未提供图示委托/);
});
