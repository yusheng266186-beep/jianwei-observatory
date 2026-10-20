// A multipart science fill may ask for a structure, equation and explanation
// without supplying inline blanks. Give these a few compact handwriting rows;
// normal cloze/number blanks still use their existing answer positions.
export function exerciseCompactFillRows(q){
 const stem=String(q.stem||'');if(q.type!=='填空'||/_{2,}|＿{2,}|[（(][\s　]+[）)]|□/.test(stem))return 0;
 const parts=[...stem.matchAll(/(?:^|\n)\s*[（(][0-9一二三四五六七八九十]+[）)]/g)].length;
 return parts>=2&&/写出[\s\S]*(?:结构简式|方程式|表达式)|(?:说明|分析)[\s\S]*(?:原因|理由|现象)/.test(stem)?Math.min(4,parts):0;
}
// Physical handwriting space in points, shared by PDF and editable Word.
export const exerciseObjectiveQuestion=q=>['选择','多选'].includes(q.type)||q.type==='填空'&&!exerciseCompactFillRows(q);
// Grouped papers use a generic title. Do not print that same title twice, but
// preserve a model's specific training title verbatim when it adds information.
export const exercisePrintSubtitle=(title,subject)=>String(title||'').replace(/\s/g,'')===subject+'专项练习'?'':String(title||'');
// Keep a readable prompt and its choices together, independently of answer
// space or lengthy teacher explanations. Long passages can still flow.
export const exerciseKeepPromptTogether=q=>!q.diagram&&String(q.stem||'').length+(q.choices||[]).join('').length<650&&String(q.stem||'').split('\n').length<18;
// Teacher pages add an answer to the prompt. A short prose question may travel
// as one unit, but a figure question is already anchored by its heading, stem,
// figure and caption; folding options and the full answer into that anchor can
// make a block larger than a page and empty the page before it.
export const exerciseTeacherKeepPromptTogether=q=>!q.diagram&&String(q.stem||'').length+(q.choices||[]).join('').length<650&&String(q.stem||'').split('\n').length<18;
export const exerciseTeacherKeepAnswerTogether=q=>!q.diagram&&String(q.stem||'').length+(q.choices||[]).join('').length+String(q.answer||'').length<650;
// Keep a bounded writing model's title, salutation and body on one page,
// independently of the longer prompt. Do not pin the following explanation.
export const exerciseKeepWritingSampleTogether=q=>q.type==='写作'&&String(q.answer||'').length<=900&&String(q.answer||'').split('\n').length<=18&&!/\$|\\begin\{|^\s*\|/m.test(String(q.answer||''));
// Keep a teacher answer label with the opening source line only. Later lines of
// a long derivation stay free to continue on the next page.
export function exercisePrintLead(value){
 const text=String(value??'').replace(/\r\n?/g,'\n');
 // A leading table, fenced sample or display formula must not be cut inside
 // the block; keep the label with the whole compact answer instead.
 if(/\$|\\\(|\\\[|\\begin\{|^\s*(?:\||`)/m.test(text))return {lead:text,rest:''};
 const at=text.indexOf('\n');
 return at<0?{lead:text,rest:''}:{lead:text.slice(0,at),rest:text.slice(at+1)};
}
// Word's two-row option grid cannot split a row, but it can separate the rows.
// Tie only the first row to the second, including figure questions whose prompt
// remains splittable; chaining the second row would pin the whole item.
// Long individual choices use a one-column path. Its bounded short option
// group needs the same keep protection as the compact two-column grid.
export const exerciseKeepChoicesTogether=question=>(question.choices||[]).length===4&&question.choices.join('').length<650&&question.choices.join('\n').split('\n').length<18;
export const exerciseChoiceKeepNext=(question,index)=>exerciseKeepChoicesTogether(question)&&index<3;
export const exerciseChoiceRowKeepNext=(question,row)=>row===0&&(question.choices||[]).length===4;
export function exerciseAnswerSpaceHeight(question,subject){
 // Objective answers belong in their option/blank, even if a model overestimates.
 if(['选择','多选'].includes(question.type))return 6;
 if(question.type==='填空')return exerciseCompactFillRows(question)*18||10;
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
// A compact subjective prompt plus at most sixteen handwriting rows fits on a
// fresh A4 page. Keeping only this bounded case avoids an orphan blank page;
// lengthy passages, diagrams and larger writing areas can still flow normally.
export const exerciseKeepWritingTogether=(q,subject)=>exerciseKeepPromptTogether(q)&&String(q.stem||'').length<=400&&exerciseAnswerSpaceHeight(q,subject)<=288;
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
// Free-flowing teacher explanations need room for their first lines. Short
// unbreakable prompts handle their own pagination and do not receive these IDs.
export function exercisePageBreakBefore(node){return /^exercise-(?:question|section)-/.test(node.id||'')&&node.startPosition?.top>700;}
