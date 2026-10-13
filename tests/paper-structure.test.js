import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseWorkbook,mergeDatasets} from '../app/data/parser.js';
import {paperStructure,questionNumbers,paperMapLayout} from '../app/engine/paper-structure.js';
import {queryQuestionMap} from '../app/engine/question-map.js';
import {Atlas} from '../app/engine/atlas.js';
const sandbox={console,setTimeout,clearTimeout,TextEncoder,TextDecoder};vm.runInNewContext(readFileSync(new URL('../vendor/xlsx.full.min.js',import.meta.url),'utf8'),sandbox);const XLSX=sandbox.XLSX;
function workbook(labels,maxima=labels.map(()=>5)){
 const book=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([[null,52,'题号',...labels,'总分'],[null,null,'分值',...maxima],[null,null,'知识点'],['52物',4,'匿名测试',...labels.map((_,i)=>i===0?0:i)]]),'数学');
 return XLSX.write(book,{type:'array',bookType:'xlsx'});
}
test('数学原表1—19题含12—14合并分：19个题号、17项得分、150分，末题保留',()=>{
 const labels=[...Array.from({length:11},(_,i)=>i+1),'12—14',15,16,17,18,19],maxima=[...Array(8).fill(5),6,6,6,15,13,15,15,17,17];
 const data=parseWorkbook(XLSX,workbook(labels,maxima),'匿名数学.xlsx'),bank=data.banks['数学|52'],structure=paperStructure(bank);
 assert.equal(bank.length,17);assert.equal(bank.at(-1).label,'19');assert.equal(bank.reduce((s,q)=>s+q.max,0),150);assert.equal(structure.numberCount,19);assert.equal(structure.scoreCount,17);assert.deepEqual(structure.combined[0].numbers,[12,13,14]);assert.equal(data.answers[0].values.at(-1),16);
 const lens=new Atlas(data).paper('数学|52');assert.equal(lens.questions.at(-1).mean,16);assert.deepEqual(queryQuestionMap(lens,{questionSearch:'第１３题'}).matches.map(q=>q.label),['12—14']);assert.equal(data.answers[0].values.length,17,'合并题没有复制或分摊得分');
});
test('第15—19题即使缺满分和知识点也保留原始分数，再合并可恢复旧版遗漏',()=>{
 const labels=Array.from({length:19},(_,i)=>i+1),maxima=labels.map((_,i)=>i<14?5:null),source=parseWorkbook(XLSX,workbook(labels,maxima),'匿名缺元数据.xlsx');
 assert.equal(source.banks['数学|52'].length,19);assert.deepEqual(source.banks['数学|52'].slice(14).map(q=>q.max),Array(5).fill(null));assert.equal(source.answers[0].values[0],0);assert.equal(source.answers[0].values.at(-1),18);
 const before=structuredClone(source);before.banks['数学|52']=before.banks['数学|52'].slice(0,14);before.answers[0].values=before.answers[0].values.slice(0,14);
 const restored=mergeDatasets(before,source);assert.equal(restored.banks['数学|52'].length,19);assert.deepEqual(restored.answers[0].values,source.answers[0].values);assert.equal(before.banks['数学|52'].length,14);
});
test('题号范围、子题和中文逗号可识别；含歧义的标签保持未知而非推测题数',()=>{
 for(const text of ['12—14题','第１２～１４题','12,13,14','12、13、14'])assert.deepEqual(questionNumbers(text),[12,13,14]);
 assert.deepEqual(questionNumbers('19(2)'),[19]);assert.deepEqual(questionNumbers('19.1'),[19]);
 for(const text of ['12:14:00','14-12','1-99999','<script>'])assert.deepEqual(questionNumbers(text),[]);
 assert.equal(paperStructure([{label:'A'},{label:'B'}]).numberCount,null);
});
test('全卷布局随宽度换行，少题不扩成大空白，19题的最后一格始终在画布内',()=>{
 for(const count of [1,3,17,19,100])for(const width of [240,280,480,760,1100]){
  const layout=paperMapLayout(count,width);
  for(let i=0;i<count;i++){const p=layout.position(i);assert.ok(p.x>=0&&p.x+layout.cellWidth<=width+.001);assert.ok(p.y+106<=layout.height);}
  if(count<=3)assert.equal(layout.height,Math.ceil(count/layout.columns)*116);
 }
});
