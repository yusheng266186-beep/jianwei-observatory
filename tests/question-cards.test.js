import test from 'node:test';
import assert from 'node:assert/strict';
import {questionCard} from '../app/ui/question-cards.js';
import {Atlas} from '../app/engine/atlas.js';
import {createRequire} from 'node:module';
const {makeFixture}=createRequire(import.meta.url)('./fixtures.cjs');
const card=(values,max=5)=>{const data=makeFixture();data.banks['数学|52'][0].max=max;data.answers=data.answers.filter(a=>a.subject==='数学').slice(0,values.length);data.answers.forEach((a,i)=>a.values[0]=values[i]);const q=new Atlas(data).paper('数学|52').questions[0];return questionCard(q,{records:values.length,threshold:.5});};
test('真实零分在卡片上是0%，保留有效样本、零分与达满分人数',()=>{
  const html=card([0,0,0]);assert.match(html,/<strong>0\.0<small>%<\/small><\/strong>/);assert.match(html,/data-known="true"/);assert.match(html,/有效作答 <b>3 \/ 3/);assert.match(html,/零分 \/ 达满分 <b>3 \/ 0/);
});
test('缺满分保留原始均分，比例与达满分留空，空作答不冒充0%',()=>{
  const unknown=card([0,2,null],null);assert.match(unknown,/<strong>—<\/strong>/);assert.match(unknown,/均分 1\.0 \/ —/);assert.match(unknown,/满分待补/);assert.match(unknown,/零分 \/ 达满分 <b>1 \/ —/);assert.match(unknown,/data-known="false"/);
  const empty=card([null,null]);assert.match(empty,/暂无有效作答/);assert.match(empty,/<strong>—<\/strong>/);assert.match(empty,/有效作答 <b>0 \/ 2/);
});
test('原始负分和超满分比例保持真实数值，不画成正常的比例条',()=>{
  for(const [values,rate] of [[[-2,-1],'-30.0'],[[8,7],'150.0']]){const html=card(values);assert.ok(html.includes('<strong>'+rate+'<small>%'));assert.match(html,/得分异常/);assert.match(html,/data-known="false"/);}
});
test('复杂原题号与知识点按文本呈现，不执行工作簿中的HTML',()=>{
  const html=questionCard({index:0,label:'21(1)<img src=x>',knowledge:'函数 <script>alert(1)</script>',max:5,rate:.5,mean:2.5,count:2,zero:0,full:0,loss:2.5},{records:2,threshold:.5});
  assert.ok(html.includes('21(1)&lt;img src=x&gt;'));assert.ok(html.includes('函数 &lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.match(html,/aria-haspopup="dialog"/);
});
