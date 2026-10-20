import test from 'node:test';import assert from 'node:assert/strict';
import guards from '../backend/content-guards.cjs';
const check=(subject,q)=>guards.contentGuards({questions:[{id:1,type:'简答',stem:'回答问题。',points:['正确得5分。'],maxScore:5,...q}]},{subject});
test('化学只拦截按序透露身份后再次问同一身份，候选与性质题保持可用',()=>{
 const stem='两种液体 $X$、$Y$ 的分子式相同，且分别为丙酸和乙酸甲酯。加入碳酸氢钠，X产生气泡。\n（1）判断 $X$、$Y$ 各是什么物质，并指出官能团。';
 assert.equal(check('化学',{stem})[0].code,'identity-leaked');
 for(const valid of [stem.replace('且分别为丙酸和乙酸甲酯','其中一种为丙酸，另一种为乙酸甲酯，对应关系未知'),stem.replace('判断 $X$、$Y$ 各是什么物质，并指出官能团','写出X的官能团和Y的水解方程式'),stem.replace('且分别为','候选物质可能分别为'),'指出以下鉴别题设计中的错误：'+stem,stem.replace('判断 $X$、$Y$ 各是什么物质','判断 A、B 各是什么物质')])assert.deepEqual(check('化学',{stem:valid}),[]);
});
test('仅对每项分值明确且无条件分支的评分核算总分',()=>{
 assert.equal(check('历史',{points:['原因2分。','影响2分。']})[0].code,'score-sum');
 assert.deepEqual(check('历史',{points:['原因2分。','影响3分。']}),[]);
 for(const points of [['每答出一个要点得2分。'],['第一问2分，第二问3分。'],['完整得5分，漏答酌情扣分。']])assert.deepEqual(check('历史',{points}),[]);
});
test('明确含标点的限字改写按字符复查，不把多版答案长度合并当成超字',()=>{
 const stem='把通知改写得简明，不超过10字（含标点）。';
 assert.equal(check('语文',{stem,answer:'甲乙丙丁戊己庚辛壬癸。'})[0].code,'character-limit');assert.deepEqual(check('语文',{stem,answer:'甲乙丙丁。'}),[]);
 assert.deepEqual(check('语文',{stem,answer:'方案一：甲乙丙。\n方案二：丁戊己。'}),[]);
});
test('地理只识别明确海岸方向矛盾，不否决纠错题或合理方位',()=>{
 const stem='海岸线呈东西走向，陆地在西侧，海洋在东侧。分析昼夜的近地面风向。';
 assert.equal(check('地理',{stem})[0].code,'coast-orientation');assert.deepEqual(check('地理',{stem:stem.replace('东西走向','南北走向')}),[]);assert.deepEqual(check('地理',{stem:'判断下面说法是否合理：'+stem}),[]);
});
test('电阻率只识别已经观察到的倒置式，不把正确变形或明确的错误示例当成新错误',()=>{
 assert.equal(check('物理',{answer:'$\\rho=\\frac{4RL}{\\pi d^2}$'})[0].code,'resistivity-inverted');
 for(const answer of ['$\\rho=\\frac{\\pi Rd^2}{4L}$','$R=\\frac{4\\rho L}{\\pi d^2}$','错误公式为$\\rho=\\frac{4RL}{\\pi d^2}$，应重新推导。'])assert.deepEqual(check('物理',{answer}),[]);
});


test('物性、某种未知物与身份不同，鉴别设问不能误拦截',()=>{
 for(const stem of ['X、Y的颜色分别为白色和黑色。判断X、Y各是什么物质。','X、Y分别为无色气体和白色固体。判断X、Y各是什么物质。','X、Y分别为某醇和某酸。判断X、Y各是什么物质。']){
  const sheet={questions:[{id:1,type:'简答',stem,answer:'说明',analysis:'独立鉴别',maxScore:5,points:['完成说明得5分。']}]};
  assert(!guards.contentGuards(sheet,{subject:'化学'}).some(i=>i.code==='identity-leaked'));
 }
});
