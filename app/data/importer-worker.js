import {adaptJSON,detectFlat,flatWorkbookSheet,parseFlat,parseWorkbook,rowsOf} from './parser.js';

// Keep file bytes and decoded rows in the worker while the teacher maps columns.
// The UI sends the File handle once; mapping never reads the workbook again.
let source=null;
const subjects=['语文','数学','英语','日语','物理','历史','化学','生物','政治','地理'];
const progress=(message,percent)=>self.postMessage({type:'progress',message,percent});
function spreadsheet(){if(!self.XLSX)importScripts('../../vendor/xlsx.full.min.js');return self.XLSX;}
self.onmessage=async({data:input})=>{
 try{
  if(input.operation==='warm'){spreadsheet();return;}
  if(input.file||input.buffer){
   progress('正在本机读取文件',4);
   source={name:input.name||input.file.name,buffer:input.file?await input.file.arrayBuffer():input.buffer,rows:null,meta:null};
  }
  if(!source)throw new Error('请重新选择需要导入的文件。');
  let dataset;
  if(/\.json$/i.test(source.name))dataset=adaptJSON(JSON.parse(new TextDecoder().decode(source.buffer)),source.name);
  else{
   progress('正在打开工作簿',6);const XLSX=spreadsheet();
   if(/\.csv$/i.test(source.name)){
    if(!source.rows){let text=new TextDecoder().decode(source.buffer);if(text.includes('\uFFFD'))text=new TextDecoder('gb18030').decode(source.buffer);const book=XLSX.read(text,{type:'string',raw:true});source.rows=rowsOf(XLSX,book.Sheets[book.SheetNames[0]]);}
   }else{
    source.meta||=XLSX.read(source.buffer,{type:'array',bookSheets:true});
    if(!source.meta.SheetNames.includes('学生基础')&&!source.meta.SheetNames.some(n=>subjects.includes(n))&&!source.rows){
     const book=XLSX.read(source.buffer,{type:'array',cellFormula:false,cellHTML:false,cellStyles:false});source.rows=flatWorkbookSheet(XLSX,book)?.rows||[];
    }
   }
   if(source.rows){
    if(!input.mapping){self.postMessage({type:'mapping',...detectFlat(source.rows)});return;}
    progress('按列对应整理成绩',55);dataset=parseFlat(source.rows,source.name,input.mapping);
   }else dataset=parseWorkbook(XLSX,source.buffer,source.name,progress,input.mapping,source.meta);
  }
  if(!dataset.scores.length&&!dataset.answers.length)throw new Error('文件里没有可读取的成绩或小题。请使用原始工作簿，或对应姓名、班级等字段。');
  source=null;self.postMessage({type:'ready',dataset});
 }catch(error){source=null;self.postMessage({type:'error',message:error.message});}
};
