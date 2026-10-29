import test from 'node:test';
import assert from 'node:assert/strict';
import builder from '../tools/build-subject-knowledge.cjs';
import {knowledgeCatalog,knowledgeTopics} from '../app/data/subject-knowledge.js';
import {createExerciseContentPicker,exerciseAllFocusLabels} from '../app/ui/exercise-content-picker.js';
import {toggleExerciseFocus,exerciseFocusParts} from '../app/ui/exercise-focus.js';
import {perQuestionExerciseRequest,setExerciseQuestionTarget} from '../app/engine/exercise-question-plan.js';
import {exerciseQuestionPlanHTML} from '../app/ui/exercise-question-plan.js';
import {exerciseRequestRows} from '../app/ui/exercise-request-brief.js';
const subjects=['语文','数学','英语','日语','物理','化学','生物','历史','政治','地理'];
test('十科均提供主题知识体系，所有目录引用可解析，标签可精确选取',()=>{
 const totals=builder.build({check:true});assert.equal(Object.keys(totals).length,9);
 for(const subject of subjects){const topics=knowledgeTopics(subject),catalog=knowledgeCatalog(subject),labels=exerciseAllFocusLabels(subject);assert(topics.length>=100);assert(catalog.modules.length>=5);assert.equal(new Set(topics.map(t=>t.value)).size,topics.length);for(const t of topics){assert(t.path.length===3);assert(t.value.length<=200);assert.deepEqual(exerciseFocusParts(toggleExerciseFocus('',t.value,labels),labels),[t.value]);}}
 for(const [subject,word]of [['语文','论证'],['英语','定语从句'],['日语','助词'],['物理','电磁感应'],['化学','滴定'],['生物','遗传'],['历史','史料'],['政治','逻辑'],['地理','等高线']])assert(knowledgeTopics(subject).some(t=>(t.label+' '+t.path.join(' ')).includes(word)),subject+' '+word);
});
test('每科浏览器独立保存专题和搜索，给当前题选点不显示全局覆盖限制',()=>{
 const picker=createExerciseContentPicker();
 for(const subject of subjects){const r={subject,targets:[],focus:''};picker.restore(r);assert(picker.html(r,[],{perQuestion:true}).includes('高中'+subject+'知识体系'));assert(!picker.html(r,[],{perQuestion:true}).includes('本次已选'));const first=knowledgeTopics(subject)[0];picker.search(subject,first.label);assert(picker.options(r).includes(first.value));picker.setMode(subject,'textbook');assert(picker.html(r).includes('教材册次'));picker.setMode(subject,'knowledge');assert(picker.html(r).includes('data-ai-knowledge-search value=""'));}
});
test('逐题清单与生成前摘要显示各题自身的知识点，不以知识点数量代替题量',()=>{
 const target=knowledgeTopics('语文')[0].value;let r=perQuestionExerciseRequest({subject:'语文',count:4,minutes:20,difficulty:'基础巩固',focus:'阅读训练',targets:[]});r=setExerciseQuestionTarget(r,0,target);r=setExerciseQuestionTarget(r,2,target);const html=exerciseQuestionPlanHTML(r,{activeIndex:2});assert(html.includes('data-ai-value="2" aria-pressed="true"'));assert.match(html,/2 \/ 4 题已选知识点/);const row=exerciseRequestRows(r).find(([label])=>label==='逐题安排')[1];assert(row.includes('第1题：'));assert(row.includes('第2题：自动选点'));assert(row.includes('第3题：'));
});
