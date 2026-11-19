import assert from 'node:assert/strict';
import test from 'node:test';
import {exerciseMathParts,recoverTrailingBrace} from '../app/engine/exercise-formulas.js';
import {exerciseRichBlocks,exerciseTableFormatIssues} from '../app/engine/exercise-rich-blocks.js';
import {wordParagraphLines} from '../app/io/exercise-word.js';
import formulaReview from '../backend/exercise-formula-review.cjs';
import generator from '../backend/generator.cjs';
import content from '../backend/content-check.cjs';

const request={subject:'数学',grade:'高三',curriculum:'函数',focus:'分式计算',count:3,minutes:15,difficulty:'基础巩固',visuals:'none',evidence:[]};
const sheet=()=>({title:'分式练习',objective:'分式计算',questions:[1,2,3].map(id=>({
 id,level:id===1?'基础':'巩固',type:'填空',stem:'计算 $1+'+id+'$。',choices:[],
 answer:String(id+1),analysis:'计算和。',points:['计算正确'],maxScore:5,minutes:5
}))});

test('四种公式分隔符共用同一词法，保持多行推导、行内竖线和转义货币符号',()=>{
 const display=String.raw`\[
\begin{aligned}
x&=1\\
y&=2
\end{aligned}
\]`;
 assert.deepEqual(exerciseMathParts(String.raw`金额 \$20，公式 \(P(A|B)\) 与 $x$。`),[
  {text:String.raw`金额 \$20，公式 `},{latex:'P(A|B)'},{text:' 与 '},{latex:'x'},{text:'。'}
 ]);
 assert.deepEqual(wordParagraphLines('开始\n'+display+'\n结束'),['开始',display,'结束']);
 assert.deepEqual(exerciseRichBlocks(display),[{kind:'text',text:display}]);
 const table=String.raw`| 表达式 | 数值 |
| --- | --- | --- |
| \(P(A|B)\) | 0.5 |`;
 assert.deepEqual(exerciseTableFormatIssues(table),[]);
 assert.deepEqual(exerciseRichBlocks(table)[0].rows,[[String.raw`\(P(A|B)\)`,'0.5']]);
 assert.equal(exerciseTableFormatIssues(table.replace('0.5 |','0.5 | 2 |')).length,1);
});

test('末尾多余分组符和合法定界符直接兼容，实际题文不改写',async()=>{
 const doc=sheet();
 doc.questions[0].analysis=String.raw`当 \(x\to+\infty}}\) 时，讨论极限。`;
 doc.questions[1].answer=String.raw`\[\left\{0,1\right\}\]`;
 const before=structuredClone(doc);
 assert.deepEqual(await generator.validateOutput(JSON.stringify(doc),request),before);
 assert.deepEqual(doc,before);
 assert.equal(recoverTrailingBrace(String.raw`\left\{x\right\}`),null);
 assert.equal(recoverTrailingBrace('x}+1'),null);
 assert.equal(recoverTrailingBrace('x^{a+1'),null);
 assert.deepEqual(await formulaReview.exerciseFormulaIssues({questions:[{id:1,analysis:String.raw`反应 $\ce{CO2 + H2O}$，并计算 $3+4$。`}]}),[]);
});

test('不明确的分组先交现有复核修正，复核原样通过或带入新错均不交付',async()=>{
 const doc=sheet();doc.questions[0].analysis=String.raw`先求 $\frac{1}{2$，再比较两值。`;
 const before=structuredClone(doc);
 await assert.rejects(generator.validateOutput(JSON.stringify(doc),request),error=>error.message==='MODEL_CONTENT_INVALID'&&/第1题解析.*花括号/.test(error.cause?.message));
 assert.deepEqual(await generator.validateOutput(JSON.stringify(doc),request,{deferFormulaReview:true}),before);
 const completion=changes=>async prompt=>{
  const issue=prompt.input.programChecks.find(row=>row.code==='formula-layout');
  assert.equal(issue.questionId,1);assert.equal(issue.field,'analysis');assert.equal(issue.formula,String.raw`\frac{1}{2`);
  return {output:JSON.stringify({approved:true,issues:[],corrections:changes})};
 };
 await assert.rejects(content.reviewContent(doc,request,{complete:completion([])}),error=>error.message==='CONTENT_REVIEW_INVALID'&&/第1题解析/.test(error.detail));
 const fix=analysis=>[{questionId:1,reason:'明确补全分母分组。',patch:{analysis}}];
 await assert.rejects(content.reviewContent(doc,request,{complete:completion(fix(String.raw`仍有 $\frac{1}{2$。`))}),/CONTENT_REVIEW_INVALID/);
 const result=await content.reviewContent(doc,request,{complete:completion(fix(String.raw`先求 $\frac{1}{2}$，再比较两值。`))});
 assert.equal(result.approved,true);
 assert.deepEqual(result.changes.map(x=>x.fields),[['analysis']]);
 assert.deepEqual(result.sheet.questions.slice(1),before.questions.slice(1));
 assert.deepEqual(doc,before);
});
