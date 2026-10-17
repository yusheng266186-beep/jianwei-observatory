// Physical writing space in points, shared by PDF and editable Word exports.
export function exerciseAnswerSpaceHeight(question,subject){
 if(question.type==='填空'&&question.diagram?.kind==='science'&&question.diagram.spec.family==='conic')return 35;
 const wordLimit=subject==='英语'?Number(question.stem.match(/(?:no more than|at most|within)\s+(\d+)\s+words/i)?.[1]):0;
 if(wordLimit&&wordLimit<=30)return 70;
 if(['阅读','实验','简答','翻译'].includes(question.type)&&Number.isFinite(question.minutes)&&question.minutes>0)return question.minutes<=5?105:question.minutes<=8?145:180;
 return wordLimit&&wordLimit<=30?70:['选择','多选'].includes(question.type)?30:question.type==='填空'?65:question.type==='写作'?260:['阅读','实验','简答','翻译'].includes(question.type)?180:130;
}
import {exerciseFigureParts} from './exercise-figure-layout.js';
export {exerciseFigureParts};
// A single terrain map is naturally taller than a two-panel diagram. Keep its
// print size legible without consuming the entire first-page reading area.
export function exercisePrintFigureParts(question){const figure=exerciseFigureParts(question);if(figure.widthPercent!==undefined)return figure;if(question.diagram?.kind==='science'&&question.diagram.spec.family==='conic'){const bounds={compact:[280,166],standard:[300,178],wide:[360,214]}[figure.size]||[300,178];return {...figure,width:Math.min(figure.width,bounds[0]),height:Math.min(figure.height,bounds[1])};}return question.diagram?.kind==='science'&&question.diagram.spec.family==='terrain'&&question.diagram.spec.view==='map'?{...figure,height:Math.min(260,figure.height)}:figure;}
export function exerciseAnswerSpaceParts(question,subject){const total=exerciseAnswerSpaceHeight(question,subject),minimum=question.diagram?Math.min(70,total):total;return {minimum,trailing:total-minimum};}

// Print an exactly repeated reading passage once; retain every question verbatim.
export function exercisePrintSections(questions){
 const sections=[];
 for(let i=0;i<questions.length;){
  const first=questions[i],next=questions[i+1];let shared='';
  if(next&&!first.diagram&&!next.diagram&&!first.figureRequest&&!next.figureRequest){let end=0;while(end<first.stem.length&&first.stem[end]===next.stem[end])end++;const common=first.stem.slice(0,end),blank=common.lastIndexOf('\n\n'),line=common.lastIndexOf('\n');shared=common.slice(0,blank>=0?blank+2:line+1);}
  if(shared.trim().length<200||first.stem.length===shared.length||next?.stem.length===shared.length){sections.push({material:'',questions:[first]});i++;continue;}
  let end=i+2;while(end<questions.length&&!questions[end].diagram&&!questions[end].figureRequest&&questions[end].stem.startsWith(shared)&&questions[end].stem.length>shared.length)end++;
  sections.push({material:shared,questions:questions.slice(i,end).map(q=>({...q,stem:q.stem.slice(shared.length)}))});i=end;
 }
 return sections;
}
