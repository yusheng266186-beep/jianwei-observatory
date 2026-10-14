import {createPDFDefinitionJob} from './pdf-runtime.js';
import {exerciseParagraph} from './exercise-math.js';
import {validateExerciseResult} from '../engine/exercise-contract.js';
export async function exercisePDF(record,{teacher=false,name='',classNo=''}={}){
 if(!record.reviewedAt)throw new Error('请完成审题确认后输出正式练习。');const sheet=validateExerciseResult(record.sheet,record.request),content=[];
 content.push({text:teacher?'专项练习参考答案与评分要点':'数学专项巩固练习',fontSize:20,bold:true,alignment:'center',margin:[0,0,0,10]});
 content.push({text:[name?'姓名：'+name:'姓名：____________',classNo?'班级：'+classNo+'班':'班级：________', '建议用时：'+record.request.minutes+'分钟'].join('    '),fontSize:10,margin:[0,0,0,10]});
 content.push({text:'训练目标：'+sheet.objective,fontSize:10,lineHeight:1.3,margin:[0,0,0,14]});
 for(const q of sheet.questions){const stack=[{text:'第 '+q.id+' 题  '+q.level+' / '+q.type+' / '+q.maxScore+'分',bold:true,fontSize:12,margin:[0,0,0,6]},await exerciseParagraph(q.stem)];if(q.choices.length===4&&q.choices.every(c=>c.length<=70&&!c.includes('\n'))){for(let i=0;i<4;i+=2)stack.push({columns:[{...await exerciseParagraph('ABCD'[i]+'. '+q.choices[i],{limit:235}),width:240},{...await exerciseParagraph('ABCD'[i+1]+'. '+q.choices[i+1],{limit:235}),width:240}],columnGap:10,margin:[0,3,0,2]});}else for(const [i,choice] of q.choices.entries())stack.push(await exerciseParagraph('ABCD'[i]+'. '+choice));
  if(teacher){stack.push({text:'参考答案',bold:true,margin:[0,8,0,3]},await exerciseParagraph(q.answer));const intro={stack:[...stack],unbreakable:true};stack.length=0;stack.push(intro,{text:'解析',bold:true,margin:[0,7,0,3]},await exerciseParagraph(q.analysis),{text:'评分要点',bold:true,margin:[0,7,0,3]});for(const point of q.points)stack.push({...await exerciseParagraph('• '+point),unbreakable:true});}
  else{stack.push({text:q.type==='选择'?'作答：________':'解答与订正：',fontSize:10,margin:[0,8,0,0]});const height=q.type==='解答'?130:q.type==='填空'?65:30;stack.push({canvas:Array.from({length:Math.floor(height/26)},(_,i)=>({type:'line',x1:0,y1:(i+1)*26,x2:490,y2:(i+1)*26,lineWidth:.3,lineColor:'#dddddd'})),margin:[0,0,0,10]});}
  content.push({stack,unbreakable:q.type!=='解答'&&stack.length<10,margin:[0,0,0,14]});
 }
 if(teacher)content.push({text:'练后按逐题结果记录复核，保留原考试成绩。',fontSize:10,margin:[0,10,0,0]});
 const definition={exercisePrint:true,exerciseFooter:teacher?'':'完成日期：____________    订正日期：____________',pageSize:'A4',pageMargins:[44,38,44,44],defaultStyle:{font:'Report',fontSize:11,color:'#111111'},content,info:{title:teacher?'数学专项练习教师答案册':'数学专项巩固练习'}};
 return createPDFDefinitionJob(definition).claim();
}
