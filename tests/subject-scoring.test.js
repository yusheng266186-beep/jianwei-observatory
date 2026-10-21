import test from 'node:test';
import assert from 'node:assert/strict';
import {validateExerciseResult,exerciseSchemaFor} from '../app/engine/exercise-contract.js';
import generator from '../backend/generator.cjs';
import reviewer from '../backend/content-check.cjs';
import {exerciseDocumentDesign,exerciseWordStyles,exerciseWordFontTable} from '../app/io/exercise-document-design.js';
const input={subject:'英语',grade:'高三',curriculum:'高中语篇与写作',focus:'阅读与语法填空',count:3,minutes:15,difficulty:'基础巩固',questionTypes:['选择','填空'],visuals:'none',evidence:[]};
const sheet={title:'语篇练习',objective:'阅读与语法',questions:[1,2,3].map((id,i)=>({id,level:'基础',type:i?'填空':'选择',stem:i?(i===1?'He __ to school yesterday.':'She __ to the park last week.'):'Where does he go?',choices:i?[]:['School','Home','Park','Library'],answer:i?'went':'A',analysis:'据语境作答。',points:['正确得'+(i?1.5:2.5)+'分。'],maxScore:i?1.5:2.5,minutes:5}))};
test('英语半分计分在前后端契约、Schema与导出入口保留，不被取整',async()=>{
 const backend=await import('../backend/exercise-contract.mjs');assert.deepEqual(validateExerciseResult(sheet,input),sheet);assert.deepEqual(backend.validateExerciseResult(sheet,input),sheet);
 const schema=exerciseSchemaFor(input).properties.questions.items.properties.maxScore;assert.equal(schema.type,'number');assert.equal(schema.minimum,0);
 for(const maxScore of [0,-1,Infinity,NaN]){const s=structuredClone(sheet);s.questions[0].maxScore=maxScore;assert.throws(()=>validateExerciseResult(s,input));}
});
test('各科出题与学科复核收到同一计分指南，示例不再向所有科目灌入5分',async()=>{
 for(const [subject,score] of Object.entries({语文:3,数学:5,英语:2.5,日语:2.5,物理:4,化学:3,生物:3,历史:3,政治:3,地理:3})){
  const request={...input,subject,questionTypes:['选择']},prompt=await generator.buildExercisePrompt(request),review=await reviewer.buildReviewPrompt(sheet,request);
  assert(prompt.system.includes('【题型与分值】'));assert(review.system.includes('【题型与分值】'));
  const shape=JSON.parse(prompt.system.match(/输出形状：(.*?)。完整Schema：/s)[1]);assert.equal(shape.questions[0].maxScore,score);
 }
});
test('学科复核可以修正错误的分值并同步评分点，保留题型与题文',async()=>{
 const s=structuredClone(sheet);s.questions[0].maxScore=5;s.questions[0].points=['选对得5分。'];
 const out=await reviewer.reviewContent(s,input,{complete:async()=>({output:JSON.stringify({approved:true,issues:[{questionId:1,reason:'阅读单项选择误设5分，应为2.5分。'}],corrections:[{questionId:1,reason:'依据阅读每小题2.5分修正题头和评分点，题目内容保持。',patch:{maxScore:2.5,points:['选对得2.5分，错选或未选得0分。']}}]})})});
 assert.equal(out.sheet.questions[0].maxScore,2.5);assert.equal(out.sheet.questions[0].stem,s.questions[0].stem);assert.equal(out.sheet.questions[0].type,s.questions[0].type);assert.equal(s.questions[0].maxScore,5);
 assert(out.changes[0].fields.includes('maxScore'));
});
test('Word正文、元信息、公式字体与页脚统一，段落可自然扩高，作答区才用固定留白',()=>{
 for(const teacher of [false,true]){const styles=exerciseWordStyles(teacher);assert.match(styles,/w:eastAsia="宋体"/);assert.match(styles,/<w:widowControl\/>/);assert.match(styles,/w:styleId="Footer"/);assert.match(styles,/w:styleId="Title"[\s\S]*?w:sz w:val="40"/);assert.doesNotMatch(styles,/w:color w:val="(?:[A-Fa-f0-9]{6})"[^>]*w:themeColor/);}
 assert.match(exerciseWordFontTable,/Songti SC/);assert.equal(exerciseDocumentDesign.body,11);assert.equal(exerciseDocumentDesign.contentWidth,507.3);
});

test('作文分档是互斥等级，不把不同档的分数相加制造校验失败',async()=>{const {default:guards}=await import('../backend/content-guards.cjs');assert.deepEqual(guards.contentGuards({questions:[{id:1,type:'写作',maxScore:60,points:['一档50分。','二档40分。','三档30分。']}]},{subject:'语文'}),[]);});

test('PDF宋体按实际字体高度换算行距，正文与公式行使用相近物理间距',async()=>{const {exercisePDFLineHeight}=await import('../app/engine/exercise-layout.js');const metrics={ascent:12.65,descent:3.15};assert(Math.abs(exercisePDFLineHeight(metrics,1.4)*(metrics.ascent+metrics.descent)-15.4)<1e-10);assert(Math.abs(exercisePDFLineHeight(metrics,1.35)*(metrics.ascent+metrics.descent)-14.85)<1e-10);});
