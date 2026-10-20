import test from 'node:test';
import assert from 'node:assert/strict';
import {wordSeparateAdjacentTables} from '../app/io/exercise-word.js';
const table=(header,cell)=>'<w:tbl><w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc><w:p><w:r><w:t>'+header+'</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>'+cell+'</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
test('consecutive diameter and electrical tables remain distinct in Word with their own repeated headers',()=>{
 const diameter=table('测量位置 / d1 / d2','1 / 0.498 / 0.502'),electrical=table('U/V / I/A','0.40 / 0.100'),input=diameter+'\n'+electrical,result=wordSeparateAdjacentTables(input);
 assert.equal((result.match(/<w:tbl>/g)||[]).length,2);assert.equal((result.match(/<w:tblHeader\/>/g)||[]).length,2);
 assert(result.startsWith(diameter));assert(result.endsWith(electrical));assert.match(result,/<\/w:tbl><w:p><w:pPr><w:keepNext\/>/);assert.doesNotMatch(result,/<\/w:tbl>\s*<w:tbl>/);
 assert.equal(wordSeparateAdjacentTables(result),result);
});
test('existing paragraphs, a single table, and table properties are preserved',()=>{
 for(const input of [table('U/V','0.40'),table('first','1')+'<w:p><w:r><w:t>实验数据</w:t></w:r></w:p>'+table('second','2'),'<w:tblPr><w:tblW w:w="100"/></w:tblPr>'])assert.equal(wordSeparateAdjacentTables(input),input);
});
