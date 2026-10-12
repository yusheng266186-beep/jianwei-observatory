importScripts('../../vendor/xlsx.full.min.js?v=controls-v12');
self.onmessage=async ({data:input})=>{
  try {
    const parser=await import('./parser.js?v=controls-v12');
    const progress=(message,percent)=>self.postMessage({type:'progress',message,percent});
    let dataset;
    if(/\.json$/i.test(input.name)) dataset=parser.adaptJSON(JSON.parse(new TextDecoder().decode(input.buffer)),input.name);
    else if(/\.csv$/i.test(input.name)) {
      let text=new TextDecoder().decode(input.buffer);
      if(text.includes('\uFFFD')) text=new TextDecoder('gb18030').decode(input.buffer);
      const book=XLSX.read(text,{type:'string',raw:true});
      const rows=parser.rowsOf(XLSX,book.Sheets[book.SheetNames[0]]);
      if(!input.mapping) { self.postMessage({type:'mapping',...parser.detectFlat(rows)}); return; }
      dataset=parser.parseFlat(rows,input.name,input.mapping);
    } else {
      const meta=XLSX.read(input.buffer,{type:'array',bookSheets:true});
      if(!input.mapping&&!meta.SheetNames.includes('学生基础')&&!meta.SheetNames.some(n=>parserSubjects.includes(n))) {
        const book=XLSX.read(input.buffer,{type:'array',sheets:[meta.SheetNames[0]],cellHTML:false,cellStyles:false});
        self.postMessage({type:'mapping',...parser.detectFlat(parser.rowsOf(XLSX,book.Sheets[meta.SheetNames[0]]))});return;
      }
      dataset=parser.parseWorkbook(XLSX,input.buffer,input.name,progress,input.mapping);
    }
    if(!dataset.scores.length&&!dataset.answers.length) throw new Error('文件里没有可读取的成绩或小题。请使用原始工作簿，或对应姓名、班级等字段。');
    self.postMessage({type:'ready',dataset});
  } catch(error) { self.postMessage({type:'error',message:error.message}); }
};
const parserSubjects=['语文','数学','英语','日语','物理','历史','化学','生物','政治','地理'];
