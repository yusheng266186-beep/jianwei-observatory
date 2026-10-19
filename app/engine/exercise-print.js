// Physical handwriting space in points, shared by PDF and editable Word.
export const exerciseObjectiveQuestion=q=>['选择','多选','填空'].includes(q.type);
// Keep a readable prompt and its choices together, independently of answer
// space or lengthy teacher explanations. Long passages can still flow.
export const exerciseKeepPromptTogether=q=>!q.diagram&&String(q.stem||'').length+(q.choices||[]).join('').length<650&&String(q.stem||'').split('\n').length<18;
export function exerciseAnswerSpaceHeight(question,subject){
 // Objective answers belong in their option/blank, even if a model overestimates.
 if(['选择','多选'].includes(question.type))return 6;
 if(question.type==='填空')return 10;
 const suggested=question.answerLines;
 if(Number.isInteger(suggested)&&suggested>0&&suggested<=48)return suggested*18;
 const answer=String(question.answer||''),words=subject==='英语'?Number(question.stem?.match(/(?:no more than|at most|within)\s+(\d+)\s+words/i)?.[1]):0;
 if(words&&words<=30)return Math.max(2,Math.ceil(words/10))*18;
 if(question.type==='写作')return Math.max(14,Math.min(36,Math.ceil((subject==='英语'?answer.split(/\s+/).length/10:answer.length/32)||18)))*18;
 // Historical sheets have no model advice. Estimate from actual response parts
 // and expected answer content rather than the length of the reading material.
 const parts=[...String(question.stem||'').matchAll(/(?:^|\n)\s*[（(][0-9一二三四五六七八九十]+[）)]/g)].length;
 const plain=answer.replace(/\\[a-zA-Z]+/g,'').replace(/[${}^_]/g,''),length=[...plain].reduce((sum,c)=>sum+(/[\u3400-\u9fff]/.test(c)?1:.5),0);
 const lines=Math.max(3,Math.min(24,Math.max(parts*3,question.points?.length||0,Math.ceil(length/34)|| (question.minutes>8?8:question.minutes>5?6:4))));
 return lines*18;
}
export function exerciseWritingRows(height){const rows=[];while(height>0){const part=Math.min(18,height);rows.push(part);height-=part;}return rows;}
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
