import test from 'node:test';
import assert from 'node:assert/strict';
import {worksheetNames} from '../app/io/sheet-names.js';

test('普通分析表保留名称；同前缀长标题全部保留为不同工作表',()=>{
  const prefix='学生阶段成绩与试卷知识点完整教学观察字段'.repeat(3),labels=['班级有效人','个人学科小题得分',prefix+'甲',prefix+'乙',prefix+'丙'];
  const names=worksheetNames(labels);assert.deepEqual(names.slice(0,2),labels.slice(0,2));assert.equal(new Set(names).size,labels.length);assert.ok(names.every(n=>n.length<=31));assert.match(names[3],/ \(2\)$/);assert.match(names[4],/ \(3\)$/);
});
test('空白、非法字符、前后引号和大小写重名均可导出，不截断Unicode字符',()=>{
  const names=worksheetNames(['[]:*?/\\','','  \'  \'  ','Math','math','数学'.repeat(15)+'🌞','数学'.repeat(15)+'🌞']);
  assert.equal(new Set(names.map(n=>n.toLowerCase())).size,names.length);assert.ok(names.every(n=>n.length>0&&n.length<=31&&!/[\x00-\x1f\[\]:*?/\\]/.test(n)&&!n.startsWith("'")&&!n.endsWith("'")&&n.isWellFormed()));
});
