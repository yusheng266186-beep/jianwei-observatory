import test from 'node:test';
import assert from 'node:assert/strict';
import generator from '../backend/generator.cjs';
import format from '../backend/document-format.cjs';
import summaries from '../backend/validation-summary.cjs';
import stores from '../backend/store.cjs';
import groups from '../backend/exercise-groups.cjs';
import worker from '../backend/worker.cjs';
import {parseExerciseJSON,validateExerciseResult} from '../app/engine/exercise-contract.js';
import {exerciseRichBlocks} from '../app/engine/exercise-rich-blocks.js';
const input={subject:'化学',grade:'高三',examStyle:'sichuan-gaokao',curriculum:'化学反应原理与工艺流程',focus:'离子反应与数据分析',count:3,minutes:20,difficulty:'基础巩固',visuals:'vector',evidence:[]};
function sample(){const guide=format.documentFormatGuide('化学');return JSON.parse(guide.split('完整字段编码示例（仅说明格式，不是本次试题）：')[1].split('。提交前逐字段核对')[0]);}
function document(){const fields=sample();return {title:'化学训练',objective:input.focus,questions:Array.from({length:3},(_,i)=>({id:i+1,level:i?'巩固':'基础',type:'填空',stem:fields.stem+'\n比较样品'+i+'。',choices:[],answer:'离子反应。',analysis:fields.analysis,points:['正确得5分。'],maxScore:5,minutes:6}))};}
test('化学提示以真实可解析的字段示例约束转义和表格，解码一次即为可排版原稿',async()=>{
 const prompt=await generator.buildExercisePrompt(input),fields=sample();
 assert.match(prompt.system,/每个LaTeX命令反斜杠必须恰好写为两个/);
 assert.match(prompt.system,/不要用LaTeX的array、tabular、hline画数据表/);
 assert.match(prompt.system,/化学逐字段核对每一个ce命令/);
 assert(fields.stem.includes('$\\ce{H+}$'));
 assert(!fields.stem.includes('\\\\ce')&&!fields.stem.includes('\\n'));
 assert.deepEqual(exerciseRichBlocks(fields.stem).find(b=>b.kind==='table').rows,[['甲','0.10'],['乙','0.20']]);
 const sheet=document();assert.deepEqual(validateExerciseResult(parseExerciseJSON(JSON.stringify(sheet)),input),sheet);
});
test('复现云端的非法化学转义与裸array，严格拒绝且不改写模型正文',()=>{
 const invalid=String.raw`{"stem":"$\ce{H2SeO3}$"}`;
 assert.throws(()=>parseExerciseJSON(invalid),SyntaxError);
 const sheet=document();sheet.questions[2].stem+='\n\\begin{array}{cc}甲 & 乙\\end{array}';
 const original=JSON.stringify(sheet);assert.throws(()=>validateExerciseResult(sheet,input),/第3题的题干未按约定/);assert.equal(JSON.stringify(sheet),original);
 const message=summaries.validationSummary('Bad escaped character in JSON at position 2957');assert.match(message,/公式转义或JSON结构错误/);assert(!message.includes('2957'));
});
test('分组历史失败读取诊断显示真实编码原因，不重复生成、不丢失已完成内容',async()=>{
 const store=new stores.MemoryStore(),key='jobs/'+'b'.repeat(32)+'/00000000-0000-4000-8000-000000000022',queue=[];
 await store.create(key+'/meta.json',{type:'exercise',input:{...input,count:6,minutes:40},createdAt:Date.now(),deadline:Date.now()+600000});
 await worker.run({key},{store,dispatch:async child=>queue.push(child)});
 const child=queue.shift();await store.create(child+'/result.json',{status:'failed',error:'MODEL_CONTENT_INVALID',failureDetail:'模型返回的题目结构或格式不完整，请重新生成。'});
 await store.create(child+'/diagnostic.json',{validation:'Bad escaped character in JSON at position 2417',raw:'private-model-source'});
 const result=await groups.snapshot(store,key);assert.equal(result.status,'failed');assert.match(result.failureDetail,/第1组未完成.*公式转义或JSON结构错误/);assert.equal(result.completedQuestions,0);assert.equal(result.resumeAvailable,true);assert(!JSON.stringify(result).includes('private-'));assert.equal(queue.length,0);
});
