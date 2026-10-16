// Physical writing space in points, shared by PDF and editable Word exports.
export function exerciseAnswerSpaceHeight(question,subject){
 const wordLimit=subject==='英语'?Number(question.stem.match(/(?:no more than|at most|within)\s+(\d+)\s+words/i)?.[1]):0;
 return wordLimit&&wordLimit<=30?70:['选择','多选'].includes(question.type)?30:question.type==='填空'?65:question.type==='写作'?260:['阅读','实验','简答','翻译'].includes(question.type)?180:130;
}
export {exerciseFigureParts} from './exercise-figure-layout.js';
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
