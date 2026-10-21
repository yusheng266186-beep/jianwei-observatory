import test from 'node:test';
import assert from 'node:assert/strict';
import {wordParagraphLines} from '../app/io/exercise-word.js';
import {mathMLToOffice} from '../app/io/exercise-word-math.js';
import {mathParts} from '../app/io/exercise-math.js';
import {exerciseRichBlocks} from '../app/engine/exercise-rich-blocks.js';
// Exact excerpt from the 2026-10-21 official-flow audit (数学-result.json,
// question 3 analysis). Page 4 of the generated teacher docx showed this block
// as raw TeX because every source line had been split into its own paragraph.
const auditAnalysis=String.raw`由（2），当 $n\geqslant2$ 时，同时有
$$p_{n+2}=\frac12p_{n+1}+\frac14p_n,\qquad p_{n+1}=\frac12p_n+\frac14p_{n-1}.$$
因此
$$\begin{aligned}
d_{n+1}
&=p_{n+2}p_n-p_{n+1}^2\\
&=\left(\frac12p_{n+1}+\frac14p_n\right)p_n-p_{n+1}^2\\
&=\frac14p_n^2-p_{n+1}\left(p_{n+1}-\frac12p_n\right)\\
&=\frac14p_n^2-\frac14p_{n+1}p_{n-1}\\
&=-\frac14d_n.
\end{aligned}$$
所以从 $d_2$ 起，数列为首项 $\dfrac1{16}$、公比 $-\dfrac14$ 的等比数列。`;
const textOf=line=>mathParts(line).filter(part=>!part.latex).map(part=>part.text).join('');
const node=(localName,children=[],attributes={},textContent='')=>({localName,children,textContent,getAttribute:name=>attributes[name]??null});
test('aligned MathML becomes an OMML matrix with its right/left alignment points',()=>{
 const leaf=(tag,text)=>node(tag,[],{},text),
  cell=(...children)=>node('mtd',children,{},children.map(child=>child.textContent).join('')),
  row=(...cells)=>node('mtr',cells,{},cells.map(child=>child.textContent).join('')),
  table=node('mtable',[row(cell(leaf('mi','d')),cell(leaf('mo','='),leaf('mn','1')))],{columnalign:'right left'}),
  omml=mathMLToOffice(node('math',[table]));
 assert.match(omml,/^<m:oMath><m:m><m:mPr><m:mcs>/);
 assert.match(omml,/<m:mc><m:mcPr><m:count m:val="1"\/><m:mcJc m:val="right"\/><\/m:mcPr><\/m:mc><m:mc><m:mcPr><m:count m:val="1"\/><m:mcJc m:val="left"\/><\/m:mcPr><\/m:mc><\/m:mcs><\/m:mPr>/);
 assert.match(omml,/<m:mr><m:e><m:r><m:t xml:space="preserve">d<\/m:t><\/m:r><\/m:e>/);
 const plain=mathMLToOffice(node('math',[node('mtable',[row(cell(leaf('mi','x')))])]));
 assert.doesNotMatch(plain,/m:mPr/);
});
test('audit aligned derivation reaches Word as one complete display-math token',()=>{
 const lines=wordParagraphLines(auditAnalysis),aligned=lines.find(line=>line.includes('\\begin{aligned}'));
 assert(aligned,'the aligned display block must remain in the document');
 assert.match(aligned,/^\$\$\\begin\{aligned\}\n/);
 assert.match(aligned,/\n\\end\{aligned\}\$\$$/);
 assert.equal((aligned.match(/\$\$/g)||[]).length,2);
 assert.equal((aligned.match(/\\\\/g)||[]).length,4);
 assert.equal((aligned.match(/\n/g)||[]).length,7);
 const parts=mathParts(aligned);
 assert.deepEqual(parts.map(part=>Boolean(part.latex)),[true]);
 assert.match(parts[0].latex,/\\begin\{aligned\}[\s\S]*\\end\{aligned\}/);
 assert.match(parts[0].latex,/&=-\\frac14d_n\./);
});
test('no audit line exposes a bare environment or alignment marker to Word runs',()=>{
 const lines=wordParagraphLines(auditAnalysis);
 assert.equal(lines.filter(line=>line.trim().startsWith('$$')).length,2);
 for(const line of lines){
  assert.equal((line.match(/\$\$/g)||[]).length%2,0,line);
  assert.doesNotMatch(textOf(line),/\\begin\{|\\end\{|^\s*&=/m,line);
 }
});
test('ordinary lines keep splitting while display math keeps its own line breaks',()=>{
 assert.deepEqual(wordParagraphLines('第一段\n第二段\n\n第三段'),['第一段','第二段','第三段']);
 assert.deepEqual(wordParagraphLines('a\r\nb'),['a','b']);
 assert.deepEqual(wordParagraphLines('前 $x$ 后\n$$a$$\n$$b$$'),['前 $x$ 后','$$a$$','$$b$$']);
 assert.deepEqual(wordParagraphLines('因此 $$x=1$$ 成立'),['因此 $$x=1$$ 成立']);
});
test('escaped dollars and an unclosed display marker do not swallow following paragraphs',()=>{
 assert.deepEqual(wordParagraphLines('价格 \\$5\n下一段'),['价格 \\$5','下一段']);
 assert.deepEqual(wordParagraphLines('开头\n$$ 未闭合\n结尾'),['开头','$$ 未闭合','结尾']);
 assert.deepEqual(wordParagraphLines('a\n\\begin{aligned}\nb\n\\end{aligned}'),['a','\\begin{aligned}','b','\\end{aligned}']);
});
test('table extraction and surrounding text stay intact around a multiline formula',()=>{
 const value=String.raw`测量数据如下：
| 次数 | 概率 |
|:--|--:|
| 1 | $\frac12$ |
| 2 | $\frac34$ |
随后代入
$$\begin{aligned}
a&=b\\
c&=d
\end{aligned}$$
完成。`;
 const blocks=exerciseRichBlocks(value);
 assert.deepEqual(blocks.map(block=>block.kind),['text','table','text']);
 assert.deepEqual(blocks[1].rows,[['1','$\\frac12$'],['2','$\\frac34$']]);
 const before=wordParagraphLines(blocks[0].text),after=wordParagraphLines(blocks[2].text);
 assert.deepEqual(before,['测量数据如下：']);
 assert.equal(after.at(0),'随后代入');
 assert.match(after[1],/^\$\$\\begin\{aligned\}\n[\s\S]*\n\\end\{aligned\}\$\$$/);
 assert.equal((after[1].match(/\n/g)||[]).length,3);
 assert.equal(after.at(-1),'完成。');
 assert.equal(after.length,3);
});
