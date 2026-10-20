import test from 'node:test';import assert from 'node:assert/strict';
import {exerciseSchema,exerciseSchemaFor,validateExerciseResult} from '../app/engine/exercise-contract.js';
import generator from '../backend/generator.cjs';
// 匿名真实失败原稿，仅含试题正文，不含身份或凭据：化学第3题有10条评分点、满分11分，
// 第1题解析含字面反斜杠n（\\n），因此首轮只应因格式失败。
const SOURCE=String.raw`{"title":"晶胞计算与碳酸钠溶液滴定","objective":"巩固晶胞粒子计数、最近邻距离和密度计算，迁移到部分占位晶胞的组成与密度计算；训练标准溶液配制、酸碱滴定及滴定误差分析。","questions":[{"id":1,"level":"巩固","type":"选择","stem":"某金属 M 的晶体可用面心立方晶胞描述：晶胞的 8 个顶点和 6 个面心均各有 1 个 M 原子，晶胞棱长为 $a=4.00\\times10^{-10}\\ \\mathrm{m}$。已知 $A_r(M)=64.0$，$N_A=6.02\\times10^{23}\\ \\mathrm{mol^{-1}}$。下列关于一个晶胞中 M 原子数、最近邻 M 原子间距和晶体密度的组合正确的是？","choices":["4 个；最近邻间距 $a/\\sqrt{2}$；密度 $6.64\\ \\mathrm{g\\,cm^{-3}}$","4 个；最近邻间距 $a/\\sqrt{3}$；密度 $6.64\\ \\mathrm{g\\,cm^{-3}}$","2 个；最近邻间距 $a/\\sqrt{2}$；密度 $3.32\\ \\mathrm{g\\,cm^{-3}}$","4 个；最近邻间距 $a/2$；密度 $6.64\\ \\mathrm{g\\,cm^{-3}}$"],"answer":"A","analysis":"一个晶胞中 M 原子数为 $8\\times\\frac{1}{8}+6\\times\\frac{1}{2}=4$。面心立方晶胞中最近邻原子位于同一面的顶点和面心，其间距为面对角线的一半，即 $\\frac{\\sqrt{2}a}{2}=\\frac{a}{\\sqrt{2}}$。\\n将棱长换算为 $4.00\\times10^{-8}\\ \\mathrm{cm}$，晶胞体积为 $6.40\\times10^{-23}\\ \\mathrm{cm^3}$。晶胞质量为 $\\frac{4\\times64.0\\ \\mathrm{g\\,mol^{-1}}}{6.02\\times10^{23}\\ \\mathrm{mol^{-1}}}=4.25\\times10^{-22}\\ \\mathrm{g}$，故晶体密度为 $\\frac{4.25\\times10^{-22}}{6.40\\times10^{-23}}=6.64\\ \\mathrm{g\\,cm^{-3}}$。","points":["选对得5分；错选或未选得0分。"],"maxScore":5,"minutes":6,"answerLines":0,"target":"晶胞结构与计算"},{"id":2,"level":"迁移","type":"选择","stem":"某立方晶体用理想化晶胞模型描述，晶胞棱长为 $450\\ \\mathrm{pm}$。X 原子完全占据全部 8 个顶点和 6 个面心；Y 原子完全占据体心，且 12 个棱心位点的平均占有率均为 $\\frac{2}{3}$，该平均占有率可用于计算晶胞中 Y 原子的平均数。已知 $A_r(X)=27.0$、$A_r(Y)=56.0$，$N_A=6.02\\times10^{23}\\ \\mathrm{mol^{-1}}$。下列关于该晶体化学式和密度的组合正确的是？","choices":["$\\mathrm{X_4Y_3}$；$5.03\\ \\mathrm{g\\,cm^{-3}}$","$\\mathrm{X_4Y_3}$；$10.1\\ \\mathrm{g\\,cm^{-3}}$","$\\mathrm{X_3Y_4}$；$5.03\\ \\mathrm{g\\,cm^{-3}}$","$\\mathrm{X_4Y_3}$；$2.52\\ \\mathrm{g\\,cm^{-3}}$"],"answer":"A","analysis":"一个晶胞中 X 原子数为 $8\\times\\frac{1}{8}+6\\times\\frac{1}{2}=4$；Y 原子数为 $1+12\\times\\frac{1}{4}\\times\\frac{2}{3}=3$，故化学式为 $\\mathrm{X_4Y_3}$。每摩尔晶胞所含粒子的质量为 $(4\\times27.0+3\\times56.0)\\ \\mathrm{g\\,mol^{-1}}=276\\ \\mathrm{g\\,mol^{-1}}$。晶胞棱长 $450\\ \\mathrm{pm}=4.50\\times10^{-8}\\ \\mathrm{cm}$，体积为 $9.1125\\times10^{-23}\\ \\mathrm{cm^3}$；一个晶胞的质量为 $\\frac{276}{6.02\\times10^{23}}\\ \\mathrm{g}$。因此密度为 $\\frac{276/(6.02\\times10^{23})}{9.1125\\times10^{-23}}=5.03\\ \\mathrm{g\\,cm^{-3}}$。","points":["选对得5分；错选或未选得0分。"],"maxScore":5,"minutes":7,"answerLines":0,"target":"晶胞结构与计算"},{"id":3,"level":"迁移","type":"填空","stem":"为测定某盐酸溶液的浓度，称取 $1.060\\ \\mathrm{g}$ 已干燥的基准级无水碳酸钠，在烧杯中溶解后定量转移至 $250.0\\ \\mathrm{mL}$ 容量瓶，冷却至室温后定容、摇匀。用移液管移取 $25.00\\ \\mathrm{mL}$ 所配溶液于锥形瓶中，滴加甲基橙，再用待测盐酸滴定。以溶液由黄色恰好变为橙色为滴定终点。已知 $M(\\ce{Na2CO3})=106.0\\ \\mathrm{g\\,mol^{-1}}$。\\n\\n三次滴定的滴定管读数如下，读数单位均为 mL。\\n\\n| 滴定次数 | 滴定管初读数/mL | 滴定管终读数/mL |\\n| --- | --- | --- |\\n| 1 | 0.10 | 20.12 |\\n| 2 | 0.20 | 20.19 |\\n| 3 | 0.15 | 20.17 |\\n\\n（1）写出滴定反应的化学方程式，并计算所配制的碳酸钠溶液的物质的量浓度。\\n（2）定量转移时，烧杯和玻璃棒的洗涤液应如何处理？滴定达到终点时，溶液颜色如何变化？\\n（3）根据数据表计算待测盐酸的物质的量浓度。\\n（4）若移液管用蒸馏水洗后未用碳酸钠溶液润洗，残留蒸馏水直接取样，按名义取样体积计算的盐酸浓度偏大还是偏小？说明理由。","choices":[],"answer":"（1）$\\ce{Na2CO3 + 2HCl -> 2NaCl + H2O + CO2}$；所配碳酸钠溶液的物质的量浓度为 $0.04000\\ \\mathrm{mol\\,L^{-1}}$。\\n（2）将烧杯和玻璃棒的洗涤液一并转移至容量瓶；终点时溶液由黄色变为橙色。\\n（3）三次盐酸体积的平均值为 $20.01\\ \\mathrm{mL}$，待测盐酸的物质的量浓度为 $0.09995\\ \\mathrm{mol\\,L^{-1}}$。\\n（4）偏大。残留水会稀释移取的碳酸钠溶液，使实际移入锥形瓶的碳酸钠物质的量少于按名义取样体积计算的值；实际消耗盐酸体积较小，而计算时仍使用名义碳酸钠物质的量，因此算得盐酸浓度偏大。","analysis":"（1）碳酸钠与盐酸反应的化学方程式为 $\\ce{Na2CO3 + 2HCl -> 2NaCl + H2O + CO2}$。碳酸钠的物质的量为 $n=\\frac{1.060\\ \\mathrm{g}}{106.0\\ \\mathrm{g\\,mol^{-1}}}=0.01000\\ \\mathrm{mol}$，所配溶液的体积为 $0.2500\\ \\mathrm{L}$，故 $c(\\ce{Na2CO3})=\\frac{0.01000}{0.2500}=0.04000\\ \\mathrm{mol\\,L^{-1}}$。\\n（2）烧杯和玻璃棒上的残留溶质需用蒸馏水洗下，洗涤液并入容量瓶，以保证溶质定量转移。题干所给甲基橙终点为溶液由黄色恰好变为橙色。\\n（3）三次盐酸体积分别为 $20.02\\ \\mathrm{mL}$、$19.99\\ \\mathrm{mL}$ 和 $20.02\\ \\mathrm{mL}$，平均值为 $20.01\\ \\mathrm{mL}=0.02001\\ \\mathrm{L}$。$25.00\\ \\mathrm{mL}$ 碳酸钠溶液中，$n(\\ce{Na2CO3})=0.04000\\times0.02500=0.001000\\ \\mathrm{mol}$。由反应方程式，$n(\\ce{HCl})=2n(\\ce{Na2CO3})=0.002000\\ \\mathrm{mol}$，所以 $c(\\ce{HCl})=\\frac{0.002000}{0.02001}=0.09995\\ \\mathrm{mol\\,L^{-1}}$。\\n（4）移液管内残留蒸馏水会稀释取入管中的碳酸钠溶液，使实际移取的碳酸钠物质的量减少，因而滴定消耗的盐酸体积减小。计算时若仍按未被稀释的碳酸钠溶液浓度和名义体积确定碳酸钠物质的量，则由较小的盐酸体积算得的盐酸浓度偏大。","points":["滴定反应方程式书写正确并配平，得2分。","列出碳酸钠物质的量及溶液浓度的正确计算关系，得1分。","算得碳酸钠溶液浓度为 $0.04000\\ \\mathrm{mol\\,L^{-1}}$，得1分。","指出烧杯和玻璃棒的洗涤液应并入容量瓶，得1分。","指出终点颜色由黄色变为橙色，得1分。","算得盐酸体积平均值为 $20.01\\ \\mathrm{mL}$，得1分。","依据反应计量关系确定 $n(\\ce{HCl})=2n(\\ce{Na2CO3})$，得1分。","算得盐酸浓度为 $0.09995\\ \\mathrm{mol\\,L^{-1}}$，得1分。","判断盐酸浓度计算结果偏大，得1分。","说明残留水使实际移取的碳酸钠物质的量减少、消耗盐酸体积减小，得1分。"],"maxScore":11,"minutes":12,"answerLines":0,"target":"物质制备与滴定"}]}`;
const request={subject:'化学',grade:'高三',examStyle:'sichuan-gaokao',curriculum:'高三已学高中课程；本次训练范围：晶胞结构与计算、物质制备与滴定、有机物结构与性质',focus:'晶胞结构与计算、物质制备与滴定、有机物结构与性质',targets:['晶胞结构与计算','物质制备与滴定'],count:3,minutes:25,difficulty:'综合提升',visuals:'auto',template:'variation',answerSpaceVersion:1,questionTypes:['选择','填空'],evidence:[{label:'14',knowledge:'晶胞结构与计算',score:0,max:3,exam:1},{label:'17',knowledge:'物质制备与滴定',score:4,max:13,exam:1},{label:'8',knowledge:'有机物结构与性质',score:0,max:3,exam:1}],basis:{mode:'latest',examCount:1,weakPoints:[{knowledge:'晶胞结构与计算',examCount:1,score:0,max:3,items:1},{knowledge:'物质制备与滴定',examCount:1,score:4,max:13,items:1},{knowledge:'有机物结构与性质',examCount:1,score:0,max:3,items:1}]}};
const fixLiteralNewlines=value=>typeof value==='string'?value.replace(/\\+n(?![A-Za-z])/g,'\n'):value;
const repaired=()=>{const sheet=JSON.parse(SOURCE);for(const q of sheet.questions){for(const field of ['stem','answer','analysis'])q[field]=fixLiteralNewlines(q[field]);q.choices=q.choices.map(fixLiteralNewlines);q.points=q.points.map(fixLiteralNewlines);}return sheet;};

test('真实化学Q3的10条评分点通过合同，只修字面换行的原稿可通过保真',async()=>{
 const original=JSON.parse(SOURCE);
 assert.equal(original.questions[2].points.length,10);
 assert.equal(original.questions[2].maxScore,11);
 assert.throws(()=>validateExerciseResult(original,request,{requireStructuredTables:true,requireFinalAnalysis:true}),/公式或正文格式/);
 const sheet=repaired();
 assert.deepEqual(sheet.questions[2].points,original.questions[2].points);
 assert.equal(validateExerciseResult(sheet,request,{requireStructuredTables:true,requireFinalAnalysis:true}),sheet);
 const fidelity=await generator.validateRepairFidelity(SOURCE,sheet,request);
 assert.equal(fidelity.verified,true);assert.equal(fidelity.readable,true);
 const schema=exerciseSchemaFor(request),points=schema.properties.questions.items.properties.points;
 assert.equal(points.minItems,1);assert.equal(points.maxItems,undefined);
 assert(schema.properties.questions.prefixItems.every(item=>item.properties.points.maxItems===undefined));
 assert.equal(exerciseSchema.properties.questions.items.properties.points.maxItems,undefined);
});

test('把10条合并为8条或删掉评分点仍被保真校验拒绝',async()=>{
 const merged=repaired(),points=merged.questions[2].points;
 merged.questions[2].points=[points[0]+points[1],...points.slice(2,8),points[8]+points[9]];
 assert.equal(merged.questions[2].points.length,8);
 assert.doesNotThrow(()=>validateExerciseResult(merged,request,{requireStructuredTables:true,requireFinalAnalysis:true}));
 await assert.rejects(generator.validateRepairFidelity(SOURCE,merged,request),error=>error.cause?.message.includes('questions[2].points'));
 const dropped=repaired();dropped.questions[2].points=dropped.questions[2].points.slice(0,9);
 assert.doesNotThrow(()=>validateExerciseResult(dropped,request,{requireStructuredTables:true,requireFinalAnalysis:true}));
 await assert.rejects(generator.validateRepairFidelity(SOURCE,dropped,request),error=>error.cause?.message.includes('questions[2].points'));
});

test('空评分点、空字符串和四川选择多条评分点仍被拒绝',()=>{
 const empty=repaired();empty.questions[2].points=[];assert.throws(()=>validateExerciseResult(empty,request),/评分点不完整/);
 const blank=repaired();blank.questions[2].points=['   '];assert.throws(()=>validateExerciseResult(blank,request),/评分点不完整/);
 const choice=repaired();choice.questions[0].points=['选A得3分。','选B得2分。'];assert.throws(()=>validateExerciseResult(choice,request),/客观题评分/);
});

test('出题与修复提示按实际小问保留评分点，Schema不再限制8条',async()=>{
 const exercise=await generator.buildExercisePrompt(request);
 const repair=await generator.buildRepairPrompt(request,{output:SOURCE,validation:'第1题的解析未按约定输出公式或正文格式。'});
 assert.match(exercise.system,/条数按实际小问和得分步骤确定，可以有多条/);
 assert.match(repair.system,/不得为压缩条数合并/);
 assert.equal(exercise.schema.properties.questions.items.properties.points.maxItems,undefined);
 assert.equal(repair.schema.properties.questions.items.properties.points.maxItems,undefined);
});
