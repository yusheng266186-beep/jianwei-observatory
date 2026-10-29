import test from 'node:test';
import assert from 'node:assert/strict';
import builder from '../tools/build-math-knowledge.cjs';
import {mathKnowledgeCatalog,mathKnowledgeTopics} from '../app/data/math-knowledge.js';
import {createExerciseContentPicker,exerciseAllFocusLabels} from '../app/ui/exercise-content-picker.js';
import {toggleExerciseFocus,exerciseFocusParts} from '../app/ui/exercise-focus.js';
import {validateExerciseRequest,exercisePlanFor} from '../app/engine/exercise-contract.js';
import {exerciseScopeModules,exerciseScopeWithGroups} from '../app/ui/exercise-presets.js';
import {exerciseSetupContent,applyExerciseSetup} from '../app/engine/exercise-setups.js';

const request={subject:'数学',grade:'高三',curriculum:'现行高中数学已学内容，以所选知识点为范围',focus:'',targets:[],count:3,minutes:15,difficulty:'基础巩固',questionTypes:[],questionPlan:[{id:1,type:'选择'},{id:2,type:'填空'},{id:3,type:'解答'}],evidence:[]};
test('数学知识体系按现行课程细分，生成数据与来源一致',()=>{
 assert.deepEqual(builder.build({check:true}),{modules:11,branches:35,groups:85,points:608});
 const topics=mathKnowledgeTopics('数学');assert.equal(mathKnowledgeTopics('物理').length,0);assert.equal(new Set(topics.map(t=>t.value)).size,608);
 for(const key of ['集合与常用逻辑用语','函数与导数','三角函数与解三角形','平面向量','数列','等式与不等式','空间向量与立体几何','平面解析几何','计数原理与概率统计','复数','推理与数学建模'])assert(mathKnowledgeCatalog.modules.some(m=>m.name===key));
 for(const term of ['定积分','矩阵','线性规划','极坐标','几何概型','反三角函数'])assert(!topics.some(t=>t.path.concat(t.label).some(label=>label.includes(term))));
 for(const term of ['分段函数的整体单调性','全概率公式','中点弦与点差法','由几何条件求椭圆离心率','二面角的向量求法'])assert(topics.some(t=>t.label===term));
});
test('细分考点可往返点选，跨专题选择进入匿名请求和教学模板',()=>{
 const all=mathKnowledgeTopics('数学'),labels=exerciseAllFocusLabels('数学');
 for(const t of all){assert(t.path.length===3);assert(t.value.length<=200);assert.deepEqual(exerciseFocusParts(toggleExerciseFocus('',t.value,labels),labels),[t.value]);assert.equal(toggleExerciseFocus(t.value,t.value,labels),'');}
 const picked=['求曲线在指定点的切线','由几何条件求椭圆离心率','条件概率的定义与计算'].map(name=>all.find(t=>t.label===name).value),r={...request,targets:picked,focus:picked.join('、')};validateExerciseRequest(r);assert.deepEqual(exercisePlanFor(r).map(t=>t.target),picked);assert.deepEqual(applyExerciseSetup({content:exerciseSetupContent(r)},request).targets,picked);
});
test('四级知识导航与教材模式共存，搜索和切换保留已选内容',()=>{
 const picker=createExerciseContentPicker(),topic=mathKnowledgeTopics('数学').find(t=>t.label==='求曲线在指定点的切线'),r={...request,targets:[topic.value],focus:topic.value};picker.restore(r);
 let html=picker.html(r);assert(html.includes('高中数学知识体系'));assert(html.includes('导数的概念与切线'));assert(html.includes('移除求曲线在指定点的切线'));
 picker.search('数学','椭圆 离心率');html=picker.options(r);assert(html.includes('由几何条件求椭圆离心率'));assert(!html.includes('导数的几何意义'));picker.setMode('数学','textbook');html=picker.html(r);assert(html.includes('人教A版'));assert(html.includes('移除求曲线在指定点的切线'));picker.setMode('数学','knowledge');assert(picker.html(r).includes('data-ai-knowledge-search value=""'));
 picker.search('数学','函数单调性');assert(picker.options(r).includes('分段函数的整体单调性'));picker.search('数学','图像 平移');assert(picker.options(r).includes('函数图象的平移'));picker.search('数学','<img>');assert(!picker.options(r).includes('<img>'));assert.deepEqual(r.targets,[topic.value]);
});

test('新知识体系保留教学范围核对，加入范围后仍可识别',()=>{const picker=createExerciseContentPicker(),topic=mathKnowledgeTopics('数学').find(t=>t.label==='求曲线在指定点的切线'),r={...request,curriculum:'高中数学已学内容：集合与常用逻辑用语',targets:[topic.value],focus:topic.value};picker.restore(r);assert(picker.html(r).includes('加入教学范围'));assert.deepEqual(exerciseScopeModules('数学',exerciseScopeWithGroups('数学',r.curriculum,['函数与导数','等式与不等式'])),['集合与常用逻辑用语','函数与导数','等式与不等式']);});
