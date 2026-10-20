import {requireExerciseQualityReview} from '../engine/exercise-quality.js';
import {createPDFDefinitionJob} from './pdf-runtime.js';
import {exerciseParagraph,exerciseLineWidth} from './exercise-math.js';
import {validateExerciseResult,difficultyProfile,exerciseTypeLabel} from '../engine/exercise-contract.js';
import {exerciseDiagramSVG} from './exercise-diagram.js';
import {exercisePrintSections,exerciseAnswerSpaceHeight,exerciseWritingRows,exerciseObjectiveQuestion,exercisePrintFigureParts,exerciseKeepPromptTogether,exerciseKeepWritingTogether,exerciseTeacherKeepPromptTogether,exerciseTeacherKeepAnswerTogether,exercisePrintLead,exerciseKeepChoicesTogether,exercisePrintSubtitle,exerciseKeepWritingSampleTogether} from '../engine/exercise-print.js';
import {exerciseFile} from './exercise-file-cache.js';
// A zero-padding row keeps short blocks together without clipping the first glyph
// when pdfmake moves a block to the next page. The worker owns this named layout.
const together=stack=>({table:{widths:['*'],body:[[{stack}]],dontBreakRows:true},layout:'exerciseKeepTogether'});
export async function exercisePDF(record,{teacher=false,name=record.student?.name||'',classNo=record.student?.classNo??''}={}){
 if(!record.reviewedAt)throw new Error('请完成审题确认后输出正式练习。');requireExerciseQualityReview(record);
 const sheet=validateExerciseResult(record.sheet,record.request),key=JSON.stringify(['pdf-v38-writing-sample',record.request,sheet,teacher,name,classNo,{exerciseId:record.id}]);
 const snapshot=structuredClone(record);return exerciseFile(key,()=>buildExercisePDF(snapshot,{teacher,name,classNo}));
}
async function buildExercisePDF(record,{teacher,name,classNo}){
 const sheet=record.sheet,content=[],subject=record.request.subject;
 const paragraph=async(value,options={})=>{const block=await exerciseParagraph(value,options);return block.text&&subject==='英语'?{...block,lineHeight:teacher?1.25:1.3,...(teacher?{fontSize:10.5}:{})}:block;};
 content.push({text:subject+(teacher?'专项练习参考答案与评分要点':'专项练习'),fontSize:20,bold:true,alignment:'center',margin:[0,0,0,6]});
 const subtitle=exercisePrintSubtitle(sheet.title,subject);if(subtitle)content.push({text:subtitle,fontSize:11,alignment:'center',color:'#444444',margin:[0,0,0,8]});
 content.push({text:[name?'姓名：'+name:'姓名：　　　　',classNo?'班级：'+classNo+'班':'班级：　　　', '建议用时：'+record.request.minutes+'分钟'].join('    '),fontSize:10,margin:[0,0,0,7]});
 content.push({text:'题量：'+sheet.questions.length+'题    满分：'+sheet.questions.reduce((n,q)=>n+q.maxScore,0)+'分    训练难度：'+difficultyProfile(record.request.difficulty).id,fontSize:10,margin:[0,0,0,7]});
 content.push({...await paragraph('教学范围：'+record.request.curriculum),fontSize:9,color:'#444444',margin:[0,0,0,7]});
 content.push({...await paragraph('训练目标：'+sheet.objective),fontSize:10.5,lineHeight:1.25,margin:[0,0,0,10]});
 for(const section of exercisePrintSections(sheet.questions)){
 if(section.material)content.push({stack:[{text:'共同材料（第 '+section.questions.map(q=>q.id).join('、')+' 题）',bold:true,fontSize:12,margin:[0,0,0,7]},await paragraph(section.material)],margin:[0,0,0,15]});
 for(const q of section.questions){const figure=q.diagram?exercisePrintFigureParts(q):{before:q.stem,after:''};const compact=(!q.diagram||(!teacher&&q.type!=='写作'&&q.stem.length+q.choices.join('').length<220))&&(teacher?q.stem.length+q.choices.join('').length+q.answer.length+q.analysis.length+q.points.join('').length<220:q.stem.length+q.choices.join('').length<220);const heading={id:'exercise-question-'+q.id,text:'第 '+q.id+' 题  '+q.level+' / '+exerciseTypeLabel(q.type)+' / '+q.maxScore+'分',bold:true,fontSize:12,margin:[0,0,0,6]},stack=[heading,...(q.target?[{text:'训练点：'+q.target,fontSize:9,color:'#444444',margin:[0,0,0,7]}]:[]),await paragraph(figure.before)];if(q.diagram){if(q.diagram.kind==='illustration'){if(!q.diagram.image)throw new Error('复杂插图尚未生成，请先补充图示。');stack.push({image:'data:'+q.diagram.image.mime+';base64,'+q.diagram.image.data,fit:[figure.width,figure.height],alignment:'center',margin:[0,8,0,5]});}else{const svg=exerciseDiagramSVG(q.diagram),nativeWidth=Number(svg.match(/width="([\d.]+)"/)?.[1]||640),nativeHeight=Number(svg.match(/height="([\d.]+)"/)?.[1]||380),scale=Math.min(figure.width/nativeWidth,figure.height/nativeHeight);stack.push({svg,svgTextFonts:true,width:nativeWidth*scale,height:nativeHeight*scale,alignment:'center',margin:[0,8,0,5]});}stack.push({...await paragraph(q.diagram.caption,{limit:460}),alignment:'center',margin:[0,0,0,9]});if(figure.before.length<500){const intro=together([...stack]);stack.length=0;stack.push(intro);}}if(figure.after)stack.push(await paragraph(figure.after));const choiceStart=stack.length;if(q.choices.length===4&&(await Promise.all(q.choices.map(c=>exerciseLineWidth(c)))).every(w=>w<=220)){for(let i=0;i<4;i+=2)stack.push({columns:[{...await paragraph('ABCD'[i]+'. '+q.choices[i],{limit:235}),width:240},{...await paragraph('ABCD'[i+1]+'. '+q.choices[i+1],{limit:235}),width:240}],columnGap:10,margin:[0,3,0,2]});}else for(const [i,choice] of q.choices.entries())stack.push(await paragraph('ABCD'[i]+'. '+choice));if(exerciseKeepChoicesTogether(q)){const choices=stack.splice(choiceStart);stack.push(together(choices));}
  const keepPrompt=teacher?exerciseTeacherKeepPromptTogether(q):exerciseKeepPromptTogether(q);
  if(!compact&&keepPrompt){const prompt=together([...stack]);stack.length=0;stack.push(prompt);}
  if(teacher){const keepAnswer=!compact&&exerciseTeacherKeepAnswerTogether(q),answerHeading={text:'参考答案',bold:true,margin:[0,8,0,3]};if(keepAnswer)stack.push(answerHeading,await paragraph(q.answer));else if(exerciseKeepWritingSampleTogether(q))stack.push(together([answerHeading,await paragraph(q.answer)]));else{const {lead,rest}=exercisePrintLead(q.answer);if(lead.length<=400&&lead.split('\n').length<8)stack.push(together([answerHeading,await paragraph(lead)]));else stack.push({...answerHeading,id:'exercise-section-answer-'+q.id},await paragraph(lead));if(rest.trim())stack.push(await paragraph(rest));}const intro=keepAnswer?together([...stack]):{stack:[...stack]};stack.length=0;stack.push(intro);const explanation=[{text:'第 '+q.id+' 题 · 解析与评分要点',bold:true,margin:[0,7,0,3]},await paragraph(q.analysis),{text:'评分要点',bold:true,margin:[0,7,0,3]}];for(const point of q.points)explanation.push(await paragraph('• '+point));if(subject==='英语'&&q.analysis.length+q.points.join('').length<1200&&q.analysis.split('\n').length<14)stack.push(together(explanation));else{if(!compact){explanation[0].id='exercise-section-analysis-'+q.id;explanation[2].id='exercise-section-points-'+q.id;}if(q.points.join('').length<500){const scoring=explanation.splice(2);delete scoring[0].id;stack.push(...explanation,together(scoring));}else stack.push(...explanation);}}
  const between=q.id===sheet.questions.at(-1).id?0:12,objective=exerciseObjectiveQuestion(q),space=teacher?0:exerciseAnswerSpaceHeight(q,subject);
  // Keep only a short prompt together. Writing space can flow across pages and
  // cannot drag the next long question onto a fresh page as one giant block.
  // A page-break callback inside an unbreakable pdfmake cell can discard
  // that cell when it moves. Kept prompts already handle their own breaks.
  if(compact||keepPrompt||q.diagram&&figure.before.length<500)delete heading.id;
  const rows=!teacher&&!objective?exerciseWritingRows(space):[],writing=rows.length?{table:{widths:['*'],heights:rows,body:rows.map(()=>[{text:' ',fontSize:1}]),dontBreakRows:true},layout:'exerciseKeepTogether',margin:[0,0,0,between]}:null;
  if(writing&&exerciseKeepWritingTogether(q,subject))content.push(together([...stack,writing]));
  else{content.push({...(compact?together(stack):{stack}),margin:[0,0,0,teacher?between:objective?space+between:2]});if(writing)content.push(writing);}
 }}
 const definition={exercisePrint:true,exerciseFooter:teacher?'练后按逐题结果记录复核，保留原考试成绩。':'',pageSize:'A4',pageMargins:[44,38,44,44],defaultStyle:{font:'Report',fontSize:11,color:'#111111'},content,info:{title:subject+(teacher?'专项练习教师答案册':'专项练习')}};
 return createPDFDefinitionJob(definition).claim();
}
