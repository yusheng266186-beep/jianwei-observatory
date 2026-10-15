import {createPDFDefinitionJob} from './pdf-runtime.js';
import {exerciseParagraph,exerciseLineWidth} from './exercise-math.js';
import {validateExerciseResult,difficultyProfile} from '../engine/exercise-contract.js';
import {exerciseDiagramSVG} from './exercise-diagram.js';
import {exercisePrintSections} from '../engine/exercise-print.js';
import {exerciseOutputs} from './exercise-output-cache.js';
// A zero-padding row keeps short blocks together without clipping the first glyph
// when pdfmake moves a block to the next page. The worker owns this named layout.
const together=stack=>({table:{widths:['*'],body:[[{stack}]],dontBreakRows:true},layout:'exerciseKeepTogether'});
export async function exercisePDF(record,{teacher=false,name='',classNo=''}={}){
 if(!record.reviewedAt)throw new Error('请完成审题确认后输出正式练习。');
 const sheet=validateExerciseResult(record.sheet,record.request),key=JSON.stringify([record.request,sheet,teacher,name,classNo]);
 return exerciseOutputs.get(key,()=>buildExercisePDF(structuredClone(record),{teacher,name,classNo}));
}
async function buildExercisePDF(record,{teacher,name,classNo}){
 const sheet=record.sheet,content=[],subject=record.request.subject;
 content.push({text:subject+(teacher?'专项练习参考答案与评分要点':'专项练习'),fontSize:20,bold:true,alignment:'center',margin:[0,0,0,10]});
 content.push({text:[name?'姓名：'+name:'姓名：____________',classNo?'班级：'+classNo+'班':'班级：________', '建议用时：'+record.request.minutes+'分钟'].join('    '),fontSize:10,margin:[0,0,0,10]});
 content.push({text:'训练难度：'+difficultyProfile(record.request.difficulty).id,fontSize:10,margin:[0,0,0,7]});
 content.push({...await exerciseParagraph('训练目标：'+sheet.objective),margin:[0,0,0,14]});
 for(const section of exercisePrintSections(sheet.questions)){
 if(section.material)content.push({stack:[{text:'共同材料（第 '+section.questions.map(q=>q.id).join('、')+' 题）',bold:true,fontSize:12,margin:[0,0,0,7]},await exerciseParagraph(section.material)],margin:[0,0,0,15]});
 for(const q of section.questions){const compact=!q.diagram&&(teacher?q.stem.length+q.choices.join('').length+q.answer.length+q.analysis.length+q.points.join('').length<650:q.stem.length+q.choices.join('').length<350);const stack=[{text:'第 '+q.id+' 题  '+q.level+' / '+q.type+' / '+q.maxScore+'分',bold:true,fontSize:12,margin:[0,0,0,6]},await exerciseParagraph(q.stem)];if(q.diagram){if(q.diagram.kind==='illustration'){if(!q.diagram.image)throw new Error('复杂插图尚未生成，请先补充图示。');stack.push({image:'data:'+q.diagram.image.mime+';base64,'+q.diagram.image.data,fit:[460,260],alignment:'center',margin:[0,8,0,5]});}else stack.push({svg:exerciseDiagramSVG(q.diagram),svgTextFonts:true,width:460,height:273,alignment:'center',margin:[0,8,0,5]});stack.push({...await exerciseParagraph(q.diagram.caption,{limit:460}),alignment:'center',margin:[0,0,0,9]});}if(q.choices.length===4&&(await Promise.all(q.choices.map(c=>exerciseLineWidth(c)))).every(w=>w<=220)){for(let i=0;i<4;i+=2)stack.push({columns:[{...await exerciseParagraph('ABCD'[i]+'. '+q.choices[i],{limit:235}),width:240},{...await exerciseParagraph('ABCD'[i+1]+'. '+q.choices[i+1],{limit:235}),width:240}],columnGap:10,margin:[0,3,0,2]});}else for(const [i,choice] of q.choices.entries())stack.push(await exerciseParagraph('ABCD'[i]+'. '+choice));
  if(!compact&&q.stem.length+q.choices.join('').length<650&&q.stem.split('\n').length<18){const prompt=together([...stack]);stack.length=0;stack.push(prompt);}
  if(teacher){stack.push({text:'参考答案',bold:true,margin:[0,8,0,3]},await exerciseParagraph(q.answer));const intro=!compact&&q.stem.length+q.answer.length+q.choices.join('').length<650?together([...stack]):{stack:[...stack]};stack.length=0;stack.push(intro,{text:'解析',bold:true,margin:[0,7,0,3]},await exerciseParagraph(q.analysis),{text:'评分要点',bold:true,margin:[0,7,0,3]});for(const point of q.points)stack.push(await exerciseParagraph('• '+point));}
  else{const choice=['选择','多选'].includes(q.type),height=choice?30:q.type==='填空'?65:q.type==='写作'?260:['阅读','实验','简答','翻译'].includes(q.type)?180:130;const writing=[{text:choice?'作答：________':'作答与订正：',fontSize:10,margin:[0,8,0,0]},{canvas:Array.from({length:Math.floor(height/26)},(_,i)=>({type:'line',x1:0,y1:(i+1)*26,x2:490,y2:(i+1)*26,lineWidth:.3,lineColor:'#dddddd'})),margin:[0,0,0,10]}];stack.push(compact?{stack:writing}:together(writing));}
  content.push({...(compact?together(stack):{stack}),margin:[0,0,0,14]});
 }}
 const definition={exercisePrint:true,exerciseFooter:teacher?'练后按逐题结果记录复核，保留原考试成绩。':'完成日期：____________    订正日期：____________',pageSize:'A4',pageMargins:[44,38,44,44],defaultStyle:{font:'Report',fontSize:11,color:'#111111'},content,info:{title:subject+(teacher?'专项练习教师答案册':'专项练习')}};
 return createPDFDefinitionJob(definition).claim();
}
