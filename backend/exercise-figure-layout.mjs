// A4 text area, shared with PDF (44pt margins) and Word (880twip margins).
export const exerciseFigurePageWidth=507.28;
export const exerciseFigureMaxHeight=420;
export function exerciseFigurePercent(value){return Math.round(Math.max(20,Math.min(100,value))*10)/10;}
export function exerciseFigureParts(question){
 const placement=question.figureLayout||question.figureRequest?.placement,stem=String(question.stem||'');
 if(!placement)return {before:stem,after:'',width:400,height:300,size:'standard',aspect:'wide'};
 const anchor=typeof placement.after==='string'?placement.after:'',index=stem.indexOf(anchor);let end=index+anchor.length;
 // A unique, complete sentence is also a safe insertion boundary. The model
 // may keep the next condition in the same paragraph; preserve all its text.
 // The anchor may include its paragraph-ending newline, so the remaining
 // stem can already start with the next question rather than another newline.
 const boundary=end===stem.length||/^\s*\n/.test(stem.slice(end))||/\n[\t ]*$/.test(anchor)||/[。！？][”’」』）)]?[\t ]*$/.test(anchor);
 const formulas=[...stem.matchAll(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g)],insideFormula=position=>formulas.some(m=>position>m.index&&position<m.index+m[0].length);
 const fallback=!anchor||index<0||stem.indexOf(anchor,index+anchor.length)>=0||!boundary||insideFormula(end);
 if(fallback){
  // An insertion anchor is layout metadata, not a question condition. Prefer
  // the first complete introduction paragraph; never split a formula or lose
  // any part of the question just because the model quoted its anchor loosely.
  const paragraph=stem.indexOf('\n');end=paragraph>=0&&!insideFormula(paragraph)?paragraph:stem.length;
 }
 const [width,height]={compact:[320,230],standard:[400,300],wide:[480,320]}[placement.width]||[400,300];
 const custom=Number.isFinite(placement.widthPercent);
 return {before:stem.slice(0,end),after:stem.slice(end).replace(/^\s*\n/,''),width:custom?exerciseFigurePageWidth*placement.widthPercent/100:width,height:custom?exerciseFigureMaxHeight:height,size:placement.width,aspect:placement.aspect||'wide',...(fallback?{placementFallback:true}:{}),...(custom?{widthPercent:placement.widthPercent}:{})};
}
export function exerciseFigurePositions(question){
 const stem=String(question.stem||''),out=[];let offset=0;
 for(const line of stem.split('\n')){const text=line.trim().slice(-600),end=offset+line.trimEnd().length;offset+=line.length+1;if(!text||stem.indexOf(text)!==stem.lastIndexOf(text)||[...stem.matchAll(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g)].some(m=>end>m.index&&end<m.index+m[0].length))continue;out.push({after:text,label:'第'+(out.length+1)+'段之后 · '+text.replace(/\$[^$]*\$/g,'〔公式〕').slice(0,40)});}
 return out;
}
