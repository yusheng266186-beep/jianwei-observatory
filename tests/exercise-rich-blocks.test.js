import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {exerciseRichBlocks,exerciseTableWidths} from '../app/engine/exercise-rich-blocks.js';
import {richExerciseHTML,exerciseParagraph} from '../app/io/exercise-math.js';
import {prepareReportFonts} from '../app/io/report-fonts.js';
const source='结果如下：\n处理 | 净光合速率/(μmol·m⁻²·s⁻¹) | 气孔导度 | 胞间CO₂浓度 | 叶绿素 | 根Na⁺ | 根K⁺\nCK | 12.5 | 0.32 | 280 | 3.2 | 1.8 | 28.0\nS | 6.8 | 0.16 | 310 | 2.1 | 8.5 | 15.0\n注：数据为平均值。';
test('旧练习没有Markdown分隔行的七列表格保留全部数据及前后题干',()=>{
 const blocks=exerciseRichBlocks(source);assert.equal(blocks.length,3);assert.equal(blocks[0].text,'结果如下：');assert.equal(blocks[2].text,'注：数据为平均值。');assert.deepEqual(blocks[1].rows,[['CK','12.5','0.32','280','3.2','1.8','28.0'],['S','6.8','0.16','310','2.1','8.5','15.0']]);assert.equal(blocks[1].header[3],'胞间CO₂浓度');
});
test('标准Markdown表格不输出分隔符，公式内部与转义竖线不拆列',()=>{
 const blocks=exerciseRichBlocks('| 实验 | 数值 |\n| :--- | ---: |\n| $P(A|B)$ | 1 |\n| A\\|B | 2 |');assert.equal(blocks.length,1);assert.equal(blocks[0].kind,'table');assert.deepEqual(blocks[0].rows,[['$P(A|B)$','1'],['A|B','2']]);assert.deepEqual(blocks[0].alignments,['left','right']);
});
test('单行竖线、数学绝对值、代码和列数不齐的内容保留原文',()=>{
 for(const text of ['说明 A | B','函数 $|x|$\n取值 $|y|$\n结束 $|z|$','$$|x|$$\n$$|y|$$\n$$|z|$$','$$\nA | B\n1 | 2\n3 | 4\n$$','```\nA | B\n1 | 2\n3 | 4\n```','A | B\n1 | 2 | 3\n4 | 5'])assert.deepEqual(exerciseRichBlocks(text),[{kind:'text',text}]);
});
test('网页预览输出有表头的真实表格，内容经转义且科学字符不被改写',async()=>{
 const html=await richExerciseHTML(source.replace('12.5','<img onerror=bad>'));assert.match(html,/<table><thead>/);assert.equal((html.match(/<th scope=/g)||[]).length,7);assert.equal((html.match(/<td /g)||[]).length,14);assert.match(html,/&lt;img onerror=bad&gt;/);assert.match(html,/CO₂/);assert.doesNotMatch(html,/<img/);
});
test('PDF表格定义可跨Worker传输，表头重复且单行不截断',async()=>{
 const definition=await exerciseParagraph(source),clone=structuredClone(definition),table=clone.stack.find(b=>b.table);assert.equal(table.layout,'exerciseDataTable');assert.equal(table.table.headerRows,1);assert.equal(table.table.keepWithHeaderRows,1);assert.equal(table.table.body.length,3);assert.equal(table.table.body[0].length,7);assert(table.table.dontBreakRows);assert.equal(table.table.body[1][1].stack[0].text,'12.5');assert(table.table.widths.reduce((a,b)=>a+b,0)<=490);
});
test('宋体科学补充字库覆盖上下标与离子电荷，旧字库与缓存地址完整保留',()=>{
 const load=n=>JSON.parse(readFileSync(new URL('../assets/report-fonts/'+n,import.meta.url))),old=load('manifest-v38.json'),current=load('manifest-v39.json'),points=m=>new Set(m.parts.flatMap(p=>p.ranges.flatMap(([a,b])=>Array.from({length:b-a+1},(_,i)=>a+i))));
 assert.deepEqual(current.parts.slice(0,-1),old.parts);const before=points(old),after=points(current);for(const point of before)assert(after.has(point));
 const text='CO₂ C₃ H₂O Na⁺ K⁺ μmol·m⁻²·s⁻¹ ₀₁₂₃₄₅₆₇₈₉ ⁺⁻⁽⁾';for(const char of text)assert(after.has(char.codePointAt(0)),char);
 const prepared=prepareReportFonts({content:[{text},{text,bold:true}]},current);assert.deepEqual(prepared.definition.content[0].text.map(r=>r.text).join(''),text);assert.deepEqual(prepared.parts.find(p=>p.id==='science').weights,['regular','medium']);
 for(const file of Object.values(current.parts.at(-1).files))assert(readFileSync(new URL('../assets/report-fonts/'+file,import.meta.url)).length>1000);
});
test('宽表标签列较窄，数据列等宽且总宽保持纸张可用宽度',()=>{
 const widths=exerciseTableWidths(7,490);assert(widths.every(w=>w>0));assert(widths[0]<widths[1]);assert(widths.slice(1).every(w=>w===widths[1]));assert(Math.abs(widths.reduce((a,b)=>a+b,0)-490)<.001);
});

test('表格公式中的双竖线范数保留原始TeX命令',()=>{const blocks=exerciseRichBlocks('名称 | 表达式\n--- | ---\n向量范数 | $\\|x\\|$');assert.equal(blocks[0].rows[0][1],'$\\|x\\|$');});
