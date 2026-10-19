import test from 'node:test';import assert from 'node:assert/strict';
import {exercisePreviewHTML,exercisePreviewText} from '../app/ui/exercise-preview.js';
import {esc} from '../app/ui/html.js';
const passage='这是一份完整的阅读材料，修改题目时应保留原始事实和条件。'.repeat(12)+'\n\n';
const record=()=>({sheet:{questions:[1,2,3].map(id=>({id,stem:passage+'第'+id+'题的具体问题。',level:'基础',type:'阅读',choices:[],answer:'参考答案',analysis:'分析过程',points:['依据材料作答'],maxScore:5,minutes:5}))}});
test('合并共同材料只改变阅读呈现，题目编辑框始终包含完整原稿，不能因编辑小问丢材料',async()=>{const r=record(),before=structuredClone(r),html=await exercisePreviewHTML(r);assert.equal((html.match(/exercise-shared-material/g)||[]).length,1);for(const q of r.sheet.questions){const match=html.match(new RegExp('<textarea data-ai-question="'+q.id+'" data-ai-part="stem">([\\s\\S]*?)</textarea>'));assert(match);assert.equal(match[1],esc(q.stem));}assert(html.includes('完整题干（含共同材料）'));assert(html.includes('更新题目预览'));assert.deepEqual(r,before);});
test('公式排版失败展示转义原文和修正提示，单处失败不吞掉题目编辑入口',async()=>{const source='<script>bad</script> $\\badformula$';const html=await exercisePreviewText(source,async()=>{throw Error('MATH_PARSE_ERROR');});assert(html.includes('data-exercise-preview-invalid'));assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>'));assert(html.includes('公式格式需调整'));assert.equal(await exercisePreviewText('正常文字'), '正常文字');});
test('图示数据异常保留本题及其他题的编辑框，并明确阻止审阅确认',async()=>{const r=record();r.sheet.questions[0].diagram={kind:'drawing',caption:'损坏图示',description:'测试',scene:{}};const html=await exercisePreviewHTML(r);assert(html.includes('data-exercise-preview-invalid'));assert(html.includes('此图示未能正常预览'));for(const id of [1,2,3])assert(html.includes('data-ai-question="'+id+'" data-ai-part="stem"'));});
test('编辑使配图锚点失效时明确要求重选，不把最后一段冒充当前插图位置',async()=>{
 const r=record(),q=r.sheet.questions[0];q.stem='新的题干。\n第一问。\n最后一问。';q.figureRequest={placement:{after:'已经删掉的引图句。',width:'standard',aspect:'wide'}};
 const html=await exercisePreviewHTML(r);assert.match(html,/exercise-figure-position-1-value[^>]*>请选择插图位置/);assert.match(html,/aria-selected="true" data-exercise-option="custom"/);assert(html.includes('请重新选择图示插入位置'));
 q.stem='引图句。如图所示。后续常量。\n问题。';q.figureRequest.placement.after='如图所示。';const valid=await exercisePreviewHTML(r);assert.match(valid,/exercise-figure-position-1-value[^>]*>当前引图句之后/);assert(!valid.includes('请重新选择图示插入位置'));
});
