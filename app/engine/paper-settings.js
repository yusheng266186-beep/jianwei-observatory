// One print specification travels with the saved content combination.
export function paperSettings(report={}){
 const p=report.outputSelection?.paper||report.paper||{};
 return {orientation:p.orientation==='landscape'?'landscape':'portrait',density:['compact','spacious'].includes(p.density)?p.density:'standard',chapterPages:p.chapterPages===true,includeCaptions:p.includeCaptions!==false,skipEmpty:p.skipEmpty===true};
}
export function paperMetrics(report){
 const p=paperSettings(report),density={compact:{body:9,table:8,padding:3,line:1.15},standard:{body:10,table:9,padding:5,line:1.25},spacious:{body:11,table:10,padding:7,line:1.4}}[p.density];
 const width=p.orientation==='landscape'?841.89:595.28,height=p.orientation==='landscape'?595.28:841.89;
 return {...p,...density,width,height,margin:48,contentWidth:width-96};
}
