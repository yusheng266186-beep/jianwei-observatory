import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import fixtures from './fixtures.cjs';
const root=fileURLToPath(new URL('../',import.meta.url));
function reader(){
 const messages=[],reads=[],scope={TextDecoder,TextEncoder,console,setTimeout,clearTimeout};scope.self=scope;scope.postMessage=message=>messages.push(message);
 const context=vm.createContext(scope);let libraries=0;
 scope.importScripts=()=>{libraries++;vm.runInContext(fs.readFileSync(root+'vendor/xlsx.full.min.js','utf8'),context);const read=scope.XLSX.read;scope.XLSX.read=(buffer,options)=>{reads.push(options);return read(buffer,options);};};
 const manifest=JSON.parse(fs.readFileSync(root+'app/runtime/manifest.json'));vm.runInContext(fs.readFileSync(root+manifest.importer,'utf8'),context);
 return {messages,reads,scope,get libraries(){return libraries;},send:input=>scope.onmessage({data:input})};
}
test('JSON 文件直接在后台读取，零下载表格库，零分和缺失值保持原样',async()=>{
 const r=reader();let read=0;await r.send({name:'backup.json',file:{arrayBuffer:async()=>{read++;return new TextEncoder().encode(JSON.stringify(fixtures.makeFixture())).buffer;}}});
 const ready=r.messages.find(m=>m.type==='ready');assert(ready);assert.equal(read,1);assert.equal(r.libraries,0);assert.equal(ready.dataset.answers[0].values[0],0);assert.equal(ready.dataset.answers[0].values[2],null);
});
test('CSV 列对应复用后台的行数据，不重新读取文件或工作簿',async()=>{
 const r=reader();let reads=0;await r.send({name:'scores.csv',file:{arrayBuffer:async()=>{reads++;return new TextEncoder().encode('姓名,班级,考试,总分,数学\n匿名甲,4,52,500,100\n匿名乙,4,52,0,0').buffer;}}});
 const mapping=r.messages.find(m=>m.type==='mapping');assert(mapping);const count=r.reads.length;
 await r.send({mapping:mapping.mapping});const result=r.messages.find(m=>m.type==='ready');assert(result);assert.equal(reads,1);assert.equal(r.reads.length,count);assert.equal(result.dataset.scores.length,2);assert.equal(result.dataset.scores[1].total,0);
});
test('通用 Excel 只解码一次，映射确认不重复解压',async()=>{
 const r=reader();await r.send({operation:'warm'});const x=r.scope.XLSX,book=x.utils.book_new();x.utils.book_append_sheet(book,x.utils.aoa_to_sheet([['姓名','班级','考试','总分','数学'],['匿名甲',4,'52',500,100]]),'成绩');
 const buffer=x.write(book,{type:'array',bookType:'xlsx'});r.reads.length=0;await r.send({name:'scores.xlsx',buffer});const mapping=r.messages.find(m=>m.type==='mapping');assert(mapping);assert.equal(r.reads.length,2);
 await r.send({mapping:mapping.mapping});assert(r.messages.some(m=>m.type==='ready'));assert.equal(r.reads.length,2);assert.equal(r.libraries,1);
});
test('错误文件可结束读取，新的文件不沿用旧映射',async()=>{
 const r=reader();await r.send({name:'broken.json',buffer:new TextEncoder().encode('{').buffer});assert(r.messages.some(m=>m.type==='error'));
 r.messages.length=0;await r.send({mapping:{}});assert(r.messages.some(m=>m.type==='error'));r.messages.length=0;
 await r.send({name:'valid.json',buffer:new TextEncoder().encode(JSON.stringify(fixtures.makeFixture())).buffer});assert(r.messages.some(m=>m.type==='ready'));
});
test('同一后台读取器处理多份文件，各份列映射相互独立',async()=>{
 const r=reader();await r.send({name:'one.csv',buffer:new TextEncoder().encode('姓名,班级,考试,总分\n匿名甲,4,52,500').buffer});let mapping=r.messages.find(m=>m.type==='mapping');await r.send({mapping:mapping.mapping});assert(r.messages.some(m=>m.type==='ready'));r.messages.length=0;
 await r.send({name:'two.csv',buffer:new TextEncoder().encode('总分,考试,班级,姓名\n0,52,7,匿名乙').buffer});mapping=r.messages.find(m=>m.type==='mapping');assert.equal(mapping.mapping.name,3);await r.send({mapping:mapping.mapping});const result=r.messages.find(m=>m.type==='ready');assert(result);assert.equal(result.dataset.students.length,1);assert.equal(result.dataset.scores[0].classNo,7);assert.equal(result.dataset.scores[0].total,0);assert.equal(r.libraries,1);
});
