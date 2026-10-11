import test from 'node:test';
import assert from 'node:assert/strict';
import {Atlas} from '../app/engine/atlas.js';
import {mergeDatasets} from '../app/data/parser.js';
import {directoryEntries} from '../app/engine/directory.js';
import {questionLens,skillLens} from '../app/engine/lenses.js';
import {studyAvailable} from '../app/ui/research.js';
import fixtures from './fixtures.cjs';
const {makeFixture}=fixtures;

test('英语、日语沿用表内折合成绩，17/18班归入各自科类',()=>{
  const atlas=new Atlas(makeFixture()),rows=atlas.rows('52');
  assert.ok(atlas.comparisonSubjects(rows).includes('外语'));
  assert.ok(!atlas.comparisonSubjects(rows).some(s=>['英语','日语'].includes(s)));
  const japanese=rows.find(r=>r.classNo===7);
  assert.equal(atlas.subject(japanese,'外语').score,60);
  assert.equal(atlas.subject(japanese,'外语').raw,80);
  assert.ok(atlas.groups('52').find(g=>g.key==='physics').rows.some(r=>r.classNo===17));
  assert.ok(atlas.groups('52').find(g=>g.key==='history').rows.some(r=>r.classNo===18));
});
test('全缺总分或总分有效线时双上线未知，已知零人则保留0',()=>{
  const f=makeFixture();f.scores=f.scores.filter(r=>r.exam==='52'&&r.classNo===4);
  for(const r of f.scores)r.total=null;
  assert.equal(new Atlas(f).summary(f.scores,'数学').underDouble,null);
  for(const r of f.scores)r.total=300;
  assert.equal(new Atlas(f).summary(f.scores,'数学').underDouble,0);
  f.lines=f.lines.map(l=>({...l,under:null}));
  assert.equal(new Atlas(f).summary(f.scores,'数学').underDouble,null);
});
test('单题零分、缺失与未知满分条件分别处理',()=>{
  const atlas=new Atlas(makeFixture()),state={key:'数学|52',classes:[4],question:0};
  const zero=questionLens(atlas,{...state,filter:'zero'}),missing=questionLens(atlas,{...state,filter:'missing'});
  assert.ok(zero.matches.some(a=>a.sid==='test-4-0'));
  assert.ok(!zero.matches.some(a=>a.sid==='test-4-1'));
  assert.deepEqual(missing.matches.map(a=>a.sid),['test-4-1']);
  const unknown=questionLens(atlas,{...state,question:2,filter:'full'});
  assert.equal(unknown.selectedId,'all');
  assert.equal(unknown.filters.find(f=>f.id==='full').available,false);
});
test('知识点完整得分率不把缺作答补0，实际0可计算',()=>{
  const lens=skillLens(new Atlas(makeFixture()),{key:'数学|52',classes:[4],knowledge:'函数'});
  assert.equal(lens.entries.find(e=>e.answer.sid==='test-4-0').rate,0);
  assert.equal(lens.entries.find(e=>e.answer.sid==='test-4-1').total,null);
  assert.equal(lens.entries.find(e=>e.answer.sid==='test-4-2').rate,null);
});
test('区分度只按完整作答分组，未填齐的高分不影响结果',()=>{
  const f=makeFixture();f.banks={'数学|52':[{label:'1',max:10},{label:'2',max:10}]};
  f.answers=Array.from({length:6},(_,i)=>({exam:'52',sid:'p'+i,classNo:4,subject:'数学',values:[i*2,i*2]}));
  const before=new Atlas(structuredClone(f)).paper('数学|52').questions[0].discrimination;
  f.answers.push({exam:'52',sid:'partial',classNo:4,subject:'数学',values:[100,null]});
  assert.equal(new Atlas(structuredClone(f)).paper('数学|52').questions[0].discrimination,before);
  f.answers[0].values[1]=null;
  assert.equal(new Atlas(f).paper('数学|52').questions[0].discrimination,null);
});
test('只有小题时目录和研究线索可用，不添加虚构阶段成绩',()=>{
  const f=makeFixture();f.scores=[];f.lines=[];const atlas=new Atlas(f);
  assert.equal(atlas.story('test-4-0').length,0);
  assert.equal(atlas.rows('52').length,0);
  assert.equal(atlas.materialAt('test-4-0').total,null);
  assert.equal(directoryEntries(atlas).length,51);
  assert.equal(studyAvailable(atlas,{scene:'people',values:{sid:'test-4-0',exam:'52'}}),true);
});
test('成绩早于小题时最新观察使用新材料，旧成绩保留原考次',()=>{
  const f=makeFixture();f.scores=f.scores.filter(r=>r.exam==='51');const atlas=new Atlas(f);
  assert.equal(atlas.materialAt('test-4-0').exam,'52');
  assert.equal(atlas.materialAt('test-4-0').questionOnly,true);
  assert.equal(atlas.story('test-4-0')[0].exam,'51');
});
test('合并备份重联全部学生引用，双方教师工作都保留',()=>{
  const current=makeFixture(),incoming=makeFixture();current.notebook=[{id:'old',note:'旧判断'}];current.research={saved:[{id:'old-study',scene:'class',values:{no:4,exam:'52'}}]};
  for(const p of incoming.students)p.id='incoming-'+p.id;
  for(const r of [...incoming.scores,...incoming.answers])r.sid='incoming-'+r.sid;
  incoming.notebook=[{id:'new',note:'新判断',study:{scene:'people',values:{sid:'incoming-test-4-0',exam:'52'},drawer:{type:'question',focusSid:'incoming-test-4-0'}}}];
  incoming.savedPeople=['incoming-test-4-0'];incoming.comparePeople=['incoming-test-4-0','incoming-test-4-2'];
  incoming.plans=[{id:'incoming-test-4-0|52|under',sid:'incoming-test-4-0',exam:'52',tier:'under'}];
  incoming.research={saved:[{id:'new-study',scene:'people',values:{sid:'incoming-test-4-0'},trail:[{type:'person',sid:'incoming-test-4-0'}],comparePeople:['incoming-test-4-0']} ]};
  const merged=mergeDatasets(current,incoming);
  assert.equal(merged.students.length,51);assert.equal(merged.notebook.length,2);assert.equal(merged.research.saved.length,2);
  assert.equal(merged.notebook[0].study.values.sid,'test-4-0');assert.equal(merged.notebook[0].study.drawer.focusSid,'test-4-0');
  assert.deepEqual(merged.savedPeople,['test-4-0']);assert.deepEqual(merged.comparePeople,['test-4-0','test-4-2']);
  assert.equal(merged.plans[0].id,'test-4-0|52|under');assert.equal(merged.research.saved[0].trail[0].sid,'test-4-0');
  assert.equal(current.notebook.length,1);assert.equal(incoming.savedPeople[0],'incoming-test-4-0');
});
