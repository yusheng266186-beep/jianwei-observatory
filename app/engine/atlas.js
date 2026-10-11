import {classDefaults,SUBJECTS,normalizeDataset} from '../data/compat.js?v=glass-20261012a';
import {valid,average,sum,distribution,groupKey,GROUPS} from './metrics.js?v=glass-20261012a';
const append=(map,key,value)=>{if(!map.has(key))map.set(key,[]);map.get(key).push(value);};
export class Atlas {
  constructor(dataset) {
    this.data=normalizeDataset(dataset);this.exams=this.data.exams;this.latest=this.exams.at(-1)?.id||'';
    this.people=new Map(this.data.students.map(p=>[p.id,p]));this.examRows=new Map();this.classRows=new Map();this.stories=new Map();this.paperRows=new Map();this.personAnswers=new Map();this.answerStories=new Map();this.materialStories=new Map();this.percentiles=new Map();
    this.lines=new Map(this.data.lines.map(l=>[l.exam+'|'+l.track,l]));
    for(const row of this.data.scores){append(this.examRows,row.exam,row);append(this.classRows,row.classNo+'|'+row.exam,row);append(this.stories,row.sid,row);}
    for(const row of this.data.answers){append(this.paperRows,row.subject+'|'+row.exam,row);append(this.personAnswers,row.sid+'|'+row.exam,row);append(this.answerStories,row.sid,row);}
    this.classes=[...new Set([...this.data.scores.map(r=>Number(r.classNo)),...this.data.answers.map(r=>Number(r.classNo))])].sort((a,b)=>a-b);
    const order=new Map(this.exams.map((e,i)=>[e.id,i]));
    for(const records of this.stories.values()) records.sort((a,b)=>(order.get(a.exam)??99)-(order.get(b.exam)??99));
  }
  profile(no){return {...classDefaults(Number(no)),...this.data.profiles[no]};}
  name(sid){return this.people.get(sid)?.name||'未命名学生';}
  exam(id){return this.exams.find(e=>e.id===id)||{id,label:id};}
  rows(exam){return this.examRows.get(exam)||[];}
  classAt(no,exam){return this.classRows.get(Number(no)+'|'+exam)||[];}
  subjects(rows){return SUBJECTS.filter(s=>rows.some(r=>valid(r.subjects?.[s]?.score)));}
  comparisonSubjects(rows){return [...new Set(this.subjects(rows).map(s=>['英语','日语'].includes(s)?'外语':s))];}
  subjectName(row,subject){return subject==='外语'?(['英语','日语'].includes(row.language)?row.language:valid(row.subjects?.['英语']?.score)?'英语':'日语'):subject;}
  subject(row,subject){return row?.subjects?.[this.subjectName(row,subject)];}
  teacher(no,subject){const teachers=this.profile(no).teachers||{};return subject==='外语'?teachers['外语']||[...new Set([teachers['英语'],teachers['日语']].filter(Boolean))].join(' / '):teachers[subject]||'';}
  line(row,tier='under',subject=null){const line=this.lines.get(row.exam+'|'+row.track);if(subject==='外语')return line?.subjects&&Object.hasOwn(line.subjects,'外语')?line.subjects['外语']?.[tier]??null:line?.subjects?.['英语']?.[tier]??line?.subjects?.['日语']?.[tier]??null;return subject?line?.subjects?.[subject]?.[tier]??null:line?.[tier]??null;}
  gap(row,tier='under',subject=null){const score=subject?this.subject(row,subject)?.score:row.total,line=this.line(row,tier,subject);return valid(score)&&valid(line)?score-line:null;}
  summary(rows,subject=null) {
    const value=r=>subject?this.subject(r,subject)?.score:r.total;
    const measured=rows.filter(r=>valid(value(r))),result=distribution(measured.map(value));
    result.records=rows.length;result.missing=rows.length-measured.length;
    result.raw=subject==='外语'?null:average(rows.map(r=>subject?this.subject(r,subject)?.raw:r.rawTotal));
    for(const tier of ['top','under']) {
      const eligible=measured.filter(r=>valid(this.line(r,tier,subject))),passing=eligible.filter(r=>this.gap(r,tier,subject)>=0);
      result[tier]=eligible.length?passing.length:null;result[tier+'Base']=eligible.length;result[tier+'Rate']=eligible.length?passing.length/eligible.length:null;
      const dualEligible=subject?eligible.filter(r=>this.gap(r,tier)!==null):[];
      result[tier+'DoubleBase']=dualEligible.length;
      result[tier+'Double']=dualEligible.length?dualEligible.filter(r=>this.gap(r,tier,subject)>=0&&this.gap(r,tier)>=0).length:null;
      result[tier+'Line']=average(eligible.map(r=>this.line(r,tier,subject)));
      result[tier+'Near10']=eligible.filter(r=>this.gap(r,tier,subject)<0&&this.gap(r,tier,subject)>=-10).length;
      result[tier+'Near20']=eligible.filter(r=>this.gap(r,tier,subject)<0&&this.gap(r,tier,subject)>=-20).length;
      result[tier+'Safe10']=eligible.filter(r=>this.gap(r,tier,subject)>=0&&this.gap(r,tier,subject)<=10).length;
    }
    return result;
  }
  groups(exam) {
    const rows=this.rows(exam);
    return GROUPS.map(group=>({...group,rows:rows.filter(r=>groupKey(this.profile(r.classNo))===group.key),classes:this.classes.filter(n=>groupKey(this.profile(n))===group.key)})).map(group=>({...group,summary:this.summary(group.rows)}));
  }
  snapshot(no,exam) {
    const rows=this.classAt(no,exam),profile=this.profile(no);
    const peers=this.rows(exam).filter(r=>groupKey(this.profile(r.classNo))===groupKey(profile));
    return {no:Number(no),exam,profile,rows,peers,summary:this.summary(rows),baseline:this.summary(peers),subjects:this.comparisonSubjects(rows).map(subject=>({subject,own:this.summary(rows,subject),peers:this.summary(peers,subject)}))};
  }
  classExams(no){return this.exams.filter(e=>this.classAt(no,e.id).length);}
  timeline(no,ids=[],matched=false) {
    const exams=this.classExams(no).filter(e=>!ids.length||ids.includes(e.id));
    const sets=exams.map(e=>new Set(this.classAt(no,e.id).map(r=>r.sid)));
    const common=matched&&sets.length?new Set([...sets[0]].filter(id=>sets.every(set=>set.has(id)))):null;
    return exams.map(exam=>{const rows=this.classAt(no,exam.id).filter(r=>!common||common.has(r.sid));return {exam,rows,summary:this.summary(rows)};});
  }
  story(sid){return this.stories.get(sid)||[];}
  materialStory(sid) {
    if(this.materialStories.has(sid))return this.materialStories.get(sid);
    const records=[...this.story(sid)],seen=new Set(records.map(r=>r.exam+'|'+r.classNo)),order=new Map(this.exams.map((e,i)=>[e.id,i]));
    for(const answer of (this.answerStories.get(sid)||[])) {
      const key=answer.exam+'|'+answer.classNo;if(seen.has(key))continue;seen.add(key);
      records.push({sid,exam:answer.exam,classNo:answer.classNo,track:answer.track||this.profile(answer.classNo).track,questionOnly:true,total:null,rawTotal:null,subjects:{},language:''});
    }
    records.sort((a,b)=>(order.get(a.exam)??99)-(order.get(b.exam)??99));this.materialStories.set(sid,records);return records;
  }
  materialAt(sid,exam='latest'){const records=this.materialStory(sid);return exam==='latest'||!exam?records.at(-1):records.find(r=>r.exam===exam);}
  subjectRank(row,subject){const score=this.subject(row,subject);return this.exam(row.exam).scope==='city'?score?.rank??null:score?.schoolRank??score?.rank??null;}
  percentile(row) {
    if(!valid(row?.total))return null;
    const key=row.exam+'|'+groupKey(this.profile(row.classNo));
    if(!this.percentiles.has(key)) {
      const peers=this.rows(row.exam).filter(r=>valid(r.total)&&groupKey(this.profile(r.classNo))===groupKey(this.profile(row.classNo))).sort((a,b)=>b.total-a.total),positions=new Map();
      peers.forEach((peer,index)=>{if(!positions.has(peer.total))positions.set(peer.total,peers.length<2?100:(peers.length-1-index)/(peers.length-1)*100);});
      this.percentiles.set(key,positions);
    }
    return this.percentiles.get(key).get(row.total)??null;
  }
  value(row,metric) {
    if(!row)return null;
    if(metric==='total')return row.total;
    if(metric==='percentile')return this.percentile(row);
    if(metric==='rank')return this.exam(row.exam).scope==='city'?row.cityRank:row.schoolRank;
    if(metric==='top'||metric==='under')return this.gap(row,metric);
    return this.subject(row,metric)?.score??null;
  }
  papers() {
    const order=new Map(this.exams.map((e,i)=>[e.id,i]));
    return Object.entries(this.data.banks).map(([key,questions])=>{
      const [subject,exam]=key.split('|'),answers=this.paperRows.get(key)||[];
      return {key,subject,exam,questions,answers,classes:[...new Set(answers.map(a=>a.classNo))].sort((a,b)=>a-b)};
    }).sort((a,b)=>(order.get(b.exam)??0)-(order.get(a.exam)??0)||SUBJECTS.indexOf(a.subject)-SUBJECTS.indexOf(b.subject));
  }
  paper(key,classes=[]) {
    const [subject,exam]=key.split('|'),bank=this.data.banks[key]||[];
    const answers=(this.paperRows.get(key)||[]).filter(a=>!classes.length||classes.includes(a.classNo));
    const measuredAnswers=answers.filter(a=>a.values.some(valid)),ordered=answers.filter(a=>bank.length&&bank.every((_,i)=>valid(a.values[i]))).sort((a,b)=>sum(b.values)-sum(a.values));
    const size=Math.max(1,Math.floor(ordered.length*(this.data.rules?.topFraction??.27))),high=ordered.slice(0,size),low=ordered.slice(-size);
    const questions=bank.map((question,index)=>{
      const values=answers.map(a=>a.values[index]).filter(valid),mean=average(values),max=valid(question.max)&&question.max>0?question.max:null;
      const highMean=average(high.map(a=>a.values[index])),lowMean=average(low.map(a=>a.values[index]));
      return {...question,index,max,mean,count:values.length,rate:max&&mean!==null?mean/max:null,loss:max&&mean!==null?average(values.map(v=>Math.max(0,max-v))):null,zero:values.filter(v=>v===0).length,full:max?values.filter(v=>v>=max).length:null,discrimination:max&&ordered.length>=6&&highMean!==null&&lowMean!==null?(highMean-lowMean)/max:null};
    });
    const knowledge=new Map();
    for(const question of questions) for(const label of (question.knowledge||'未标注').split(/[,，;；]/).map(s=>s.trim()).filter(Boolean)) append(knowledge,label,question);
    const skills=[...knowledge].map(([name,qs])=>{
      const known=qs.filter(q=>q.max&&q.count),possible=sum(known.map(q=>q.max*q.count)),earned=sum(known.map(q=>q.mean*q.count)),rate=possible?earned/possible:null;
      return {name,questions:qs,rate,loss:known.length?sum(known.map(q=>q.loss)):null,advice:rate===null?'补充满分':rate<(this.data.rules?.lowRate??.5)?'优先修复':rate<(this.data.rules?.focusRate??.75)?'巩固迁移':'保持优势'};
    }).sort((a,b)=>(b.loss??-1)-(a.loss??-1));
    const eligible=new Set([...this.rows(exam).filter(r=>(!classes.length||classes.includes(r.classNo))&&valid(r.subjects?.[subject]?.score)).map(r=>r.sid+'|'+r.classNo),...answers.map(r=>r.sid+'|'+r.classNo)]);
    return {key,subject,exam,answers,questions,skills,coverage:eligible.size?answers.length/eligible.size:0,mean:average(measuredAnswers.map(a=>sum(a.values)))};
  }
  questionsFor(row,subject) {
    const answer=(this.personAnswers.get(row.sid+'|'+row.exam)||[]).find(a=>a.subject===subject&&a.classNo===row.classNo);
    return answer?(this.data.banks[subject+'|'+row.exam]||[]).map((q,i)=>({...q,index:i,score:answer.values[i]??null,loss:valid(q.max)&&valid(answer.values[i])?Math.max(0,q.max-answer.values[i]):null})):[];
  }
  critical(exam,{tier='under',band=20,side='below',classes=[]}={}) {
    return this.rows(exam).filter(r=>!classes.length||classes.includes(r.classNo)).map(row=>{
      const gap=this.gap(row,tier);if(gap===null)return null;
      const within=side==='both'?Math.abs(gap)<=band:side==='above'?gap>=0&&gap<=band:gap<0&&gap>=-band;
      if(!within)return null;
      const weaknesses=this.comparisonSubjects([row]).map(subject=>({subject,gap:this.gap(row,tier,subject),score:this.subject(row,subject)?.score})).filter(r=>r.gap!==null&&r.gap<0).sort((a,b)=>a.gap-b.gap);
      return {row,gap,weaknesses,nearest:[...weaknesses].sort((a,b)=>b.gap-a.gap)[0]};
    }).filter(Boolean).sort((a,b)=>Math.abs(a.gap)-Math.abs(b.gap));
  }
}
