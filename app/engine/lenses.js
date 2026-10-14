import {valid,sum,difference} from './metrics.js?v=runtime-v34';
import {answerStructure} from './answer-structure.js?v=runtime-v34';

export function subjectLens(atlas,state) {
  const no=Number(state.no),subject=['英语','日语'].includes(state.subject)?'外语':state.subject,tier=state.tier==='top'?'top':'under',snapshot=atlas.snapshot(no,state.exam),own=atlas.summary(snapshot.rows,subject),peers=atlas.summary(snapshot.peers,subject);
  const entries=snapshot.rows.map(row=>{
    const record=atlas.subject(row,subject),subjectGap=atlas.gap(row,tier,subject),totalGap=atlas.gap(row,tier),known=subjectGap!==null&&totalGap!==null;
    const quadrant=!known?'unknown':subjectGap>=0?(totalGap>=0?'double':'subjectOnly'):(totalGap>=0?'totalOnly':'bothBelow');
    return {row,score:record?.score??null,raw:record?.raw??null,rank:atlas.subjectRank(row,subject),subjectGap,totalGap,quadrant};
  });
  const filters=[['all','全部学生',e=>true],['below','学科线下',e=>e.subjectGap!==null&&e.subjectGap<0],['near','学科线下10分',e=>e.subjectGap!==null&&e.subjectGap<0&&e.subjectGap>=-10],['double','双上线',e=>e.quadrant==='double'],['subjectOnly','学科上线 · 总分线下',e=>e.quadrant==='subjectOnly'],['totalOnly','总分上线 · 学科线下',e=>e.quadrant==='totalOnly'],['bothBelow','双未上线',e=>e.quadrant==='bothBelow'],['unknown','双线口径不全',e=>e.quadrant==='unknown'],['missing','缺学科成绩',e=>!valid(e.score)]];
  const selected=filters.find(([id])=>id===(state.filter||'all'))||filters[0],query=(state.search||'').trim(),matches=entries.filter(e=>selected[2](e)&&(!query||atlas.name(e.row.sid).includes(query)));
  matches.sort((a,b)=>state.sort==='name'?atlas.name(a.row.sid).localeCompare(atlas.name(b.row.sid),'zh'):state.sort==='high'?(b.score??-Infinity)-(a.score??-Infinity):(a.score??Infinity)-(b.score??Infinity));
  const timeline=atlas.classExams(no).map(exam=>{const part=atlas.snapshot(no,exam.id);return {exam,own:atlas.summary(part.rows,subject),peers:atlas.summary(part.peers,subject)};});
  const papers=atlas.papers().filter(p=>p.exam===state.exam&&(subject==='外语'?['英语','日语'].includes(p.subject):p.subject===subject)&&p.classes.includes(no));
  const dualBase=entries.filter(e=>e.quadrant!=='unknown').length,dualPass=dualBase?entries.filter(e=>e.quadrant==='double').length:null;
  return {no,subject,tier,snapshot,own,peers,dualBase,dualPass,distance:difference(own.mean,peers.mean),entries,matches,filters:filters.map(([id,label,test])=>({id,label,count:entries.filter(test).length})),selected:selected[1],timeline,papers};
}

export function skillLens(atlas,state) {
  const lens=atlas.paper(state.key,state.classes||[]),skill=lens.skills.find(s=>s.name===state.knowledge),questions=skill?.questions||[],max=questions.length&&questions.every(q=>valid(q.max)&&q.max>0)?sum(questions.map(q=>q.max)):null;
  const low=Math.max(0,Math.min(1,atlas.data.rules?.lowRate??.5)),focus=Math.max(low,Math.min(1,atlas.data.rules?.focusRate??.75));
  const entries=lens.answers.map(answer=>{
    const values=questions.map(q=>answer.values[q.index]??null),filled=values.filter(valid).length,total=filled?sum(values):null,complete=questions.length>0&&filled===questions.length,rate=complete&&max>0?total/max:null,loss=rate!==null?Math.max(0,max-total):null;
    return {answer,values,filled,total,complete,rate,loss};
  });
  const filters=[['all','全部作答',e=>true],['low','优先研究',e=>e.rate!==null&&e.rate<low],['focus','继续巩固',e=>e.rate!==null&&e.rate>=low&&e.rate<focus],['secure','保持优势',e=>e.rate!==null&&e.rate>=focus],['missing','作答未齐',e=>!e.complete],['unknown','无法计算得分率',e=>e.rate===null]];
  const selected=filters.find(([id])=>id===(state.filter||'all'))||filters[0],query=(state.search||'').trim(),matches=entries.filter(e=>selected[2](e)&&(!query||atlas.name(e.answer.sid).includes(query)));
  matches.sort((a,b)=>state.sort==='name'?atlas.name(a.answer.sid).localeCompare(atlas.name(b.answer.sid),'zh'):state.sort==='high'?(b.total??-Infinity)-(a.total??-Infinity):(a.total??Infinity)-(b.total??Infinity));
  return {lens,skill,questions,max,low,focus,entries,matches,filters:filters.map(([id,label,test])=>({id,label,count:entries.filter(test).length})),selected:selected[1]};
}

export function questionLens(atlas,state) {
  const lens=atlas.paper(state.key,state.classes||[]),question=lens.questions.find(q=>q.index===Number(state.question))||lens.questions[0];
  if(!question)return {lens,question:null,filters:[],matches:[],selected:'全部作答'};
  const score=a=>a.values[question.index],knownMax=valid(question.max)&&question.max>0;
  const filters=[['all','全部作答',a=>true,true],['zero','零分',a=>score(a)===0,true],['partial','未得满分',a=>valid(score(a))&&score(a)<question.max,knownMax],['full','满分',a=>valid(score(a))&&score(a)>=question.max,knownMax],['missing','未填得分',a=>!valid(score(a)),true]];
  const structure=answerStructure(lens.answers,question,atlas.data.rules),extra=structure.groups.filter(g=>!filters.some(([id])=>id===g.id)).map(g=>[g.id,g.label+' · '+g.range,g.test,true]);
  const selected=[...filters,...extra].find(([id,,,available])=>id===(state.filter||'all')&&available)||filters[0],query=(state.search||'').trim(),matches=lens.answers.filter(a=>selected[2](a)&&(!query||atlas.name(a.sid).includes(query)));
  matches.sort((a,b)=>state.sort==='name'?atlas.name(a.sid).localeCompare(atlas.name(b.sid),'zh'):state.sort==='high'?(score(b)??-Infinity)-(score(a)??-Infinity):(score(a)??Infinity)-(score(b)??Infinity));
  return {lens,question,matches,structure,selected:selected[1],selectedId:selected[0],filters:filters.map(([id,label,test,available])=>({id,label,count:available?lens.answers.filter(test).length:null,available}))};
}
