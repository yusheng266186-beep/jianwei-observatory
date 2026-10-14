import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFlat,mergeDatasets,adaptJSON} from '../app/data/parser.js';
import {normalizeDataset} from '../app/data/compat.js';
import {remapScopedContext} from '../app/data/identity.js';
import {Atlas} from '../app/engine/atlas.js';
import {buildTeachingReport} from '../app/engine/reports.js';
import {scoreRows} from '../app/io/exports.js';
const flat=rows=>parseFlat([['姓名','班级','考试','总分','学生识别码'],...rows],'匿名身份测试.csv');
test('同考次不同班同名学生独立研究与报告，再次导入不重复',()=>{
 const data=flat([['同名',4,'52',500],['同名',7,'52',450]]),atlas=new Atlas(data);
 assert.equal(data.students.length,2);const a=data.scores.find(r=>r.classNo===4),b=data.scores.find(r=>r.classNo===7);assert.notEqual(a.sid,b.sid);
 assert.equal(atlas.materialAt(b.sid,'52').total,450);assert.equal(atlas.classRank(b),1);
 const report=buildTeachingReport(atlas,{kind:'student',sid:b.sid,exam:'52'});assert.equal(report.spec.no,7);assert.equal(report.sections[0].rows[0][1],'450.0');
 const merged=mergeDatasets(data,flat([['同名',7,'52',0]]));assert.equal(merged.students.length,2);assert.equal(merged.scores.length,2);assert.equal(merged.scores.find(r=>r.classNo===4).total,500);assert.equal(merged.scores.find(r=>r.classNo===7).total,0);
 assert.equal(mergeDatasets(merged,data).students.length,2);
});
test('唯一姓名跨考次转班保持连续历史，补充原考次仍正确',()=>{
 const data=mergeDatasets(flat([['转班学生',4,'51',400]]),flat([['转班学生',7,'52',480]]));assert.equal(data.students.length,1);assert.equal(new Atlas(data).materialStory(data.students[0].id).length,2);
 const result=mergeDatasets(data,flat([['转班学生',4,'51',405]]));assert.equal(result.students.length,1);assert.equal(result.scores.find(r=>r.exam==='51').total,405);
});
test('学生识别码支持同班同名、改名和转班，不同识别码不互相覆盖',()=>{
 const data=flat([['同名',4,'51',400,'001'],['同名',4,'51',450,'002']]);assert.equal(data.students.length,2);assert.equal(data.scores.length,2);
 const result=mergeDatasets(data,flat([['更名学生',7,'52',500,'001']]));assert.equal(result.students.length,2);const person=result.students.find(p=>p.sourceId==='001');assert.equal(person.name,'更名学生');assert.equal(new Atlas(result).materialStory(person.id).length,2);
 assert.throws(()=>mergeDatasets(result,flat([['更名学生',8,'52',600,'001']])),/识别码/);
});
test('旧档案按班分开成绩、小题及有明确范围的教师记录，不改原始数字',()=>{
 const data=flat([['同名',4,'52',500],['同名',7,'52',450]]),old=data.scores[0].sid;
 const legacy={...structuredClone(data),students:[{id:old,name:'同名'}],identityScopes:undefined,scores:data.scores.map(r=>({...r,sid:old})),answers:[{sid:old,exam:'52',classNo:4,subject:'数学',values:[0]},{sid:old,exam:'52',classNo:7,subject:'数学',values:[9]}],plans:[{id:old+'|52|under',sid:old,classNo:7,exam:'52',tier:'under',note:'已实施'}],notebook:[{spec:{kind:'student',sid:old,exam:'52',no:7},sections:[]}]};
 const fixed=normalizeDataset(legacy),seven=fixed.scores.find(r=>r.classNo===7).sid;assert.equal(fixed.students.length,2);assert.notEqual(seven,old);assert.equal(fixed.answers.find(a=>a.sid===seven).values[0],9);assert.equal(fixed.plans[0].sid,seven);assert.equal(fixed.plans[0].id,seven+'|52|under');assert.equal(fixed.notebook[0].spec.sid,seven);
 assert.equal(remapScopedContext({sid:old,classNo:7,exam:'52'},fixed).sid,seven);assert.equal(normalizeDataset(fixed).students.length,2);
 assert.equal(remapScopedContext({values:{no:7,exam:'52',sid:old}},fixed).values.sid,seven);
});
test('小题单独补充按班匹配同名学生，旧格式识别码可用',()=>{
 const data=flat([['同名',4,'52',500],['同名',7,'52',450]]);
 const incoming=adaptJSON({scores:[],itemResponses:[{name:'同名',exam:'52',classNo:7,subject:'数学',scores:[0]}]},'补充.json');
 const result=mergeDatasets(data,incoming);assert.equal(result.students.length,2);assert.equal(result.answers[0].sid,result.scores.find(r=>r.classNo===7).sid);
});
test('分析表再次导入保留识别码与考次代码，考试名称可识别',()=>{
 const original=flat([['同名',4,'52',500,'001'],['同名',4,'52',450,'002']]),atlas=new Atlas(original);atlas.exam('52').label='自定义考试标题';
 const sheet=scoreRows(atlas,atlas.rows('52')),parsed=parseFlat(sheet,'再次导入.csv');assert.equal(parsed.students.length,2);assert(parsed.scores.every(r=>r.exam==='52'));assert.equal(parsed.students[0].sourceId,'001');assert.equal(mergeDatasets(original,parsed).scores.length,2);
 assert.equal(flat([['学生',4,'高三第二次月考',500]]).scores[0].exam,'52');
});
test('姓名哈希碰撞也不合并不同学生',()=>{const data=flat([['costarring',4,'52',500],['liquid',4,'52',450]]);assert.equal(data.students.length,2);assert.notEqual(data.students[0].id,data.students[1].id);assert.equal(data.scores.length,2);});
test('无法区分的同班同考次同名数值不静默覆盖，重复及互补行可整理',()=>{
 assert.throws(()=>flat([['同名',4,'52',500],['同名',4,'52',450]]),/识别码或整理重复行/);
 const repeated=flat([['同名',4,'52',500],['同名',4,'52',500]]);assert.equal(repeated.scores.length,1);
 const partial=parseFlat([['姓名','班级','考试','总分','语文','数学'],['学生',4,'52',500,100,null],['学生',4,'52',null,null,90]],'补充.csv');assert.equal(partial.scores[0].total,500);assert.equal(partial.scores[0].subjects.语文.score,100);assert.equal(partial.scores[0].subjects.数学.score,90);
});
