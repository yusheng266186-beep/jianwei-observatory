import test from 'node:test';
import assert from 'node:assert/strict';
import {detectFlat,parseFlat} from '../app/data/parser.js';
import {Inbox} from '../app/data/inbox.js';

test('通用表识别前置和后置原分/赋分排名，保留市校班范围及原始表头来源',()=>{
 for(const headers of [['原分市排名','赋分校排名','原分班级排名'],['市排名（原分）','校内排名（赋分）','班内名次（原分）'],['总分市原名','总分校赋名','班原名']]){
  const rows=[['姓名','班级','考试','总分',...headers],['匿名核对',4,'52',500,100,12,3]],r=parseFlat(rows,'核对.csv').scores[0];
  assert.deepEqual([r.cityRank,r.schoolRank,r.classRank],[100,12,3]);assert.deepEqual(r.rankSources,{cityRank:headers[0],schoolRank:headers[1],classRank:headers[2]});
 }
});
test('同一范围优先赋分、其次通用、最后原分；学科排名和含糊名次不当作总分校排',()=>{
 const headers=['姓名','班级','考试','原分校排名','校排名','赋分校排名','数学赋分校排名','排名','原分市排名','市排名','赋分市排名'],rows=[headers,['匿名核对',4,'52',30,20,10,1,2,300,200,100]],m=detectFlat(rows).mapping,r=parseFlat(rows,'核对.csv').scores[0];assert.equal(m.schoolRank,5);assert.equal(r.schoolRank,10);assert.equal(m.cityRank,10);assert.equal(r.cityRank,100);
 const other=detectFlat([['姓名','班级','数学赋分校排名','排名','班级排名']]);assert.equal(other.mapping.schoolRank,null);assert.equal(other.mapping.cityRank,null);assert.equal(other.mapping.classRank,4);
 const raw=parseFlat([['姓名','班级','考试','原分校排名'],['匿名',4,'52',19]],'原分.csv').scores[0];assert.equal(raw.schoolRank,19);
});
test('教师手动对应列覆盖自动优先级，空白赋分名次不暗中取另一口径的原分名次',()=>{
 const rows=[['姓名','班级','考试','原分校排名','赋分校排名'],['匿名',4,'52',19,null]],m=detectFlat(rows).mapping;assert.equal(parseFlat(rows,'核对.csv').scores[0].schoolRank,null);assert.equal(parseFlat(rows,'核对.csv',{...m,schoolRank:3}).scores[0].schoolRank,19);
});
function inbox(){const notices=[],html=[],read=[];const data={students:[{}],exams:[{}],scores:[{}],answers:[],lines:[],banks:{}};return {notices,html,read,target:{notify:m=>notices.push(m),input:{value:'file'},epoch:0,prepare(){},current:()=>({scores:[],answers:[],lines:[],banks:{}}),progress(){},file:async f=>{read.push(f.name);return data;},shell:s=>html.push(s),error:m=>{throw Error(m);}}};}
test('全部不支持的文件明确通知并复位输入，不启动读取；空文件列表保持安静',async()=>{
 const t=inbox();await Inbox.prototype.read.call(t.target,[{name:'旧材料.xlsm'}]);assert.equal(t.read.length,0);assert.equal(t.notices.length,1);assert.match(t.notices[0],/xlsx/);assert.equal(t.target.input.value,'');await Inbox.prototype.read.call(t.target,[]);assert.equal(t.notices.length,1);
});
test('混合拖入继续导入支持的文件，确认页保留跳过文件说明并转义文件名',async()=>{
 const t=inbox();await Inbox.prototype.read.call(t.target,[{name:'成绩.JSON'},{name:'<script>.xlsm'}]);assert.deepEqual(t.read,['成绩.JSON']);assert.match(t.notices[0],/已跳过 1/);assert.match(t.html.at(-1),/&lt;script&gt;\.xlsm/);assert(!t.html.at(-1).includes('<script>'));assert.equal(t.target.busy,false);
});
