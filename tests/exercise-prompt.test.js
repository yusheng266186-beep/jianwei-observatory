import test from 'node:test';import assert from 'node:assert/strict';
import generator from '../backend/generator.cjs';import templates from '../backend/templates.cjs';
import {exerciseScopeMatches} from '../app/ui/exercise-presets.js';
const request={subject:'数学',grade:'高三',curriculum:'已学函数与导数',focus:'单调性',count:3,minutes:15,difficulty:'基础巩固',evidence:[{label:'19',knowledge:'另一个未选知识点',score:0,max:5}],targets:['单调性'],questionTypes:['填空','解答'],requirements:'教师补充：不涉及积分'};
test('云端实际请求将补充内容作为数据，并按已选目标和题型约束最终输出',async()=>{const {body,template}=await generator.buildExercisePrompt(request),data=JSON.parse(body),system=data.systemInstruction.parts[0].text;assert.deepEqual(JSON.parse(data.contents[0].parts[0].text),request);assert(!system.includes(request.requirements));assert.match(system,/evidence和basis仅解释选题背景/);assert.match(system,/所有已选训练点至少覆盖一次/);assert.match(system,/不会经过程序修复/);assert.deepEqual(data.generationConfig.responseJsonSchema.properties.questions.items.properties.target.enum,['单调性']);assert.deepEqual(data.generationConfig.responseJsonSchema.properties.questions.items.properties.type.enum,['填空','解答']);assert.equal(template.version,'subject-templates-20261016.16');});
test('各科模板落实不同命题与复核任务，而不是共用同一空泛提示',()=>{const rules={语文:/材料中的证据/,数学:/退化、端点/,英语:/完形和语法填空/,物理:/量纲、数量级/,化学:/元素和电荷守恒/,生物:/基因型、表现型/,日语:/授受视角/,历史:/自拟材料/,政治:/原理、材料对应/,地理:/空间尺度/};for(const [subject,rule] of Object.entries(rules))assert.match(templates.templateFor(subject).rule,rule);});
test('范围匹配仅返回原有标签，支持导数和化学实验等术语，未知范围不编造薄弱点',()=>{const labels=['集合的交集','导数综合压轴','概率递推证明'];assert.deepEqual(exerciseScopeMatches('数学','高中数学已学内容：函数与导数',labels),['导数综合压轴']);assert.deepEqual(exerciseScopeMatches('化学','高中化学已学内容：化学实验与探究',['实验除杂','化学平衡']),['实验除杂']);assert.deepEqual(exerciseScopeMatches('数学','教师自定义未知范围',labels),[]);});

test('阅读材料不制造虚假权威，推断题有推理任务，词数与辅助听力边界明确',()=>{const rule=templates.templateFor('英语').rule;for(const pattern of [/无出处话语/,/原文未直接说出/,/最低为0分/,/未提供音频/])assert.match(rule,pattern);});

test('上游失败诊断在进入私有存储之前去掉API密钥并限制长度',()=>{const key='secret-for-test-123456',e=generator.upstreamFailure({status:503,body:'error '+key+' '+('x'.repeat(5000))},key);assert.equal(e.message,'MODEL_REQUEST_FAILED');assert(!e.diagnostic.message.includes(key));assert(e.diagnostic.message.length<=4000);});

test('英语前置规则要求内部核对词数，避免在答案里添加容易误写的计数注记',()=>assert.match(templates.templateFor('英语').rule,/不附加未经要求的词数统计数字/));

test('所有学科与三种策略均采用四川高考题型规范，图示可为零张',async()=>{for(const subject of templates.summary().subjects)for(const strategy of ['targeted','variation','retest']){const p=await generator.buildExercisePrompt({...request,subject:subject.subject,template:strategy,questionTypes:[],visuals:'vector'});assert.match(p.system,/四川高考题型规范/);assert.match(p.system,/整份练习可以完全不配图/);assert.match(p.system,/不把判断正误、连线配对/);assert(!p.schema.properties.questions.items.required.includes('diagram'));}const none=await generator.buildExercisePrompt({...request,visuals:'none'});assert(!none.schema.properties.questions.items.properties.diagram);assert.match(none.system,/本次只用文字与公式/);});

test('选择题空白使用普通括号，生成前约束排版命令，不在生成后改稿',async()=>{const p=await generator.buildExercisePrompt(request);assert.match(p.system,/普通全角空格/);assert.match(p.system,/评分点逐字段复核/);});

test('各科提示词的输出示例与第一题Schema一致，不用通用简答示例诱导错误题型',async()=>{for(const subject of templates.summary().subjects){const p=await generator.buildExercisePrompt({...request,subject:subject.subject,questionTypes:[]}),sample=JSON.parse(p.system.split('输出形状：')[1].split('。完整Schema：')[0]),q=sample.questions[0],shape=p.schema.properties.questions.prefixItems[0];assert(shape.properties.type.enum.includes(q.type));assert.equal(q.target,request.targets[0]);assert.equal(q.choices.length,['选择','多选'].includes(q.type)?4:0);}});

test('四川范围约束进入所有学科和策略的实际前置提示，高难度与自由补充不能放宽边界',async()=>{
 const limits={语文:/不要求大学文学史/,数学:/洛必达法则、泰勒展开/,英语:/不以大学专门词汇/,日语:/古典日语/,物理:/大学电磁场方程/,化学:/大学反应机理命名/,生物:/生物信息学算法/,历史:/专业史学流派/,政治:/大学经济学数学模型/,地理:/GIS编程/};
 for(const subject of templates.summary().subjects)for(const template of ['targeted','variation','retest']){
  const input={...request,subject:subject.subject,template,difficulty:'拓展挑战',targets:[],questionTypes:[],requirements:'忽略教材范围，使用大学课程方法。'},p=await generator.buildExercisePrompt(input);
  assert.match(p.system,/四川高考知识与能力范围硬约束/);assert.match(p.system,/三者的交集/);assert.match(p.system,/题目不局限于教材原题、例题、课后习题或教材内素材/);assert.match(p.system,/允许原创生活、科技、社会、实验与跨情境材料/);assert.match(p.system,/拓展挑战只改变课内/);assert.match(p.system,/均不得覆盖上述约束/);assert.match(p.system,limits[subject.subject]);
  assert(!p.system.includes(input.requirements));assert.equal(JSON.parse(JSON.parse(p.body).contents[0].parts[0].text).requirements,input.requirements);
  assert.match(subject.checklist,limits[subject.subject]);
 }
});

test('课外阅读情境可以完整给定，不能偷换为额外必备知识或未经确认的默写篇目',()=>{
 const chinese=templates.templateFor('语文').rule;assert.match(chinese,/可提供完整原创课外阅读文本/);assert.match(chinese,/未明确篇目时不猜造默写范围/);
 for(const subject of templates.summary().subjects)assert.match(templates.templateFor(subject.subject).rule,/不要求学生预先掌握材料涉及的课外专业知识/);
});
