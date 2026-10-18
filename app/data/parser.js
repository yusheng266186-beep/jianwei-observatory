import { SUBJECTS, EXAM_ORDER, EXAM_NAMES, classDefaults, finite, normalizeDataset } from './compat.js?v=runtime-v45';
import {mergeContext} from './context.js?v=runtime-v45';
import {identityHash,mergeStudentIdentities} from './identity.js?v=runtime-v45';
import {explicitRanks,rankColumns,ranksFrom} from '../engine/ranking.js?v=runtime-v45';
import {mergeDuplicateScore,mergeDuplicateAnswer,mergeScoreRecord,supplement,supplementAnswerValues} from './merge-policy.js?v=runtime-v45';
import {collectImportConflict} from './import-conflicts.js';
const txt=v=>String(v??'').trim();
const identifierHeaders=['学生识别码','学生编号','学号','识别码','studentid','queryid'];
const num=v=>v==null||txt(v)===''?null:Number.isFinite(Number(v))?Number(v):null;
const code=v=>{const raw=txt(v).replace(/[物历]$/,'');return Object.keys(EXAM_NAMES).find(id=>EXAM_NAMES[id]===raw)||raw;};
const track=(raw,n)=>/[历]$/.test(txt(raw))?'history':/[物]$/.test(txt(raw))?'physics':classDefaults(n).track;
const cityExam=e=>['入口','1册','2册','3册','4册'].includes(e);
const SCHOOL='荣县一中',SCHOOL_ALIASES=new Set(['荣县一中','荣县第一中学']),schoolKey=v=>txt(v).replace(/\s/g,''),isOurSchool=v=>SCHOOL_ALIASES.has(schoolKey(v));
// The supplied multi-exam worksheet reuses four total-rank headings even
// when historical blocks contain class ranks in its last column. This exact
// template profile was checked against preserved source rows; flat files and
// explicitly named class-rank columns continue to use their own headings.
function sourceTotalColumns(headers,exam){
 const columns=rankColumns(headers,6,9);
 const label=column=>headers.map(r=>txt(r[column])).join('');
 if(!/市赋名/.test(label(7))||!/校原名/.test(label(8))||!/校赋名/.test(label(9)))return columns;
 if(['2册','3册','41','4半','43'].includes(exam)){
  return {schoolRank:{column:['41','4半'].includes(exam)?7:8,label:'校内排名'},classRank:{column:9,label:'班级排名'},...(cityExam(exam)?{cityRank:{column:7,label:'市排名'}}:{})};
 }
 return {...columns,...(!cityExam(exam)?{cityRank:undefined}:{})};
}
function sourceSubjectColumns(headers,exam,raw,end,ranking,school){
 const columns=rankColumns(headers,raw,end),label=c=>headers.map(r=>txt(r[c])).join('');
 if(exam!=='43'||!/市赋名/.test(label(7))||!/校原名/.test(label(8))||!/校赋名/.test(label(9)))return columns;
 return {...(school==null?{}:{schoolRank:{column:ranking,label:'学科校内排名'}}),classRank:{column:school??ranking,label:'学科班级排名'}};
}
const fresh=source=>({schemaVersion:1,school:'荣县一中',grade:'高2024级',title:'成绩研究工作区',sourceName:source,importedAt:new Date().toISOString(),anonymous:false,students:[],scores:[],profiles:{},exams:[],lines:[],banks:{},answers:[],sheets:[]});
function people(data){
 const map=new Map(),occupied=new Set(data.students.map(p=>p.id)),byName=new Map(),scopedScores=new Map();let indexed=0;
 for(const person of data.students){if(!byName.has(person.name))byName.set(person.name,[]);byName.get(person.name).push(person);}
 function scoreScope(exam,classNo){return JSON.stringify([exam,classNo]);}
 return (name,sourceId='',exam='',classNo=null)=>{
  name=txt(name);sourceId=txt(sourceId);const key=sourceId?'identifier:'+sourceId:'name:'+name;
  if(!sourceId){
   // Scores are appended as sheets are read. Index each new row once rather
   // than scanning every student's full history for every subject response.
   for(;indexed<data.scores.length;indexed++){const row=data.scores[indexed],scope=scoreScope(row.exam,row.classNo);if(!scopedScores.has(scope))scopedScores.set(scope,new Set());scopedScores.get(scope).add(row.sid);}
   const ids=scopedScores.get(scoreScope(exam,classNo)),matches=(byName.get(name)||[]).filter(p=>ids?.has(p.id));if(matches.length===1)return matches[0].id;if(matches.length>1)throw new Error('同班同考次的同名学生小题记录需要学生识别码。');
  }
  if(!map.has(key)){let id=identityHash(sourceId?key:name),suffix=0;while(occupied.has(id))id=identityHash(key+'|'+(++suffix));const person={id,name,...(sourceId?{sourceId}:{})};map.set(key,person);data.students.push(person);occupied.add(id);if(!byName.has(name))byName.set(name,[]);byName.get(name).push(person);}
  return map.get(key).id;
 };
}
function examsFrom(data){
 const ids=new Set([...data.scores.map(r=>r.exam),...data.answers.map(r=>r.exam)]);
 for(const id of ids)if(!data.exams.some(e=>e.id===id))data.exams.push({id,label:EXAM_NAMES[id]||id,scope:cityExam(id)?'city':'school',order:EXAM_ORDER.includes(id)?EXAM_ORDER.indexOf(id):99});
 return normalizeDataset(data);
}
export function rowsOf(XLSX,sheet){
 const range=XLSX.utils.decode_range(sheet['!ref']||'A1');range.e.c=Math.min(range.e.c,99);
 return XLSX.utils.sheet_to_json(sheet,{header:1,defval:null,raw:true,range,blankrows:true});
}
export function flatWorkbookSheet(XLSX,workbook){
 const sheets=Object.entries(workbook.Sheets).map(([name,sheet])=>({name,rows:rowsOf(XLSX,sheet)}));
 return sheets.find(s=>{const {mapping:m}=detectFlat(s.rows);return m.name!=null&&m.classNo!=null&&m.exam!=null&&(m.total!=null||SUBJECTS.some(subject=>m[subject]!=null));})||sheets.find(s=>s.rows.slice(0,15).some(row=>row.some(c=>/^(姓名|学生姓名)$/.test(txt(c)))))||sheets[0];
}
// Merged cells are blank in every row except their anchor. A merged school
// cell therefore looks like an empty school on continuation rows; fill only
// that declared range so the scope filter still sees the real school.
function rowsWithMergedColumn(XLSX,sheet,rows,column){
 const range=XLSX.utils.decode_range(sheet['!ref']||'A1'),rowOffset=range.s.r||0,columnOffset=range.s.c||0,local=column-columnOffset;
 if(local<0)return rows.map(row=>row?[...row]:row);
 const result=rows.map(row=>row?[...row]:row);
 for(const merge of sheet['!merges']||[]){
  if(merge.s.c>column||merge.e.c<column)continue;
  const anchor=result[merge.s.r-rowOffset]?.[local];
  if(anchor==null||txt(anchor)==='')continue;
  for(let r=merge.s.r-rowOffset;r<=merge.e.r-rowOffset;r++)if(result[r]&&(result[r][local]==null||txt(result[r][local])===''))result[r][local]=anchor;
 }
 return result;
}
export function parseWorkbook(XLSX,buffer,source,progress=()=>{},mapping=null,catalog=null){
 progress('读取工作表目录',8);
 const meta=catalog||XLSX.read(buffer,{type:'array',bookSheets:true});
 const chosen=meta.SheetNames.filter(n=>n==='学生基础'||n==='教师名单'||/^班级有效人/.test(n)||SUBJECTS.includes(n));
 if(!meta.SheetNames.includes('学生基础')){const generic=meta.SheetNames.filter(n=>!SUBJECTS.includes(n)&&!/(班级有效人|个人学科小题|班级多次|教师名单|说明)/.test(n));chosen.push(...generic);}
 const workbook=XLSX.read(buffer,{type:'array',cellFormula:false,cellStyles:false,cellHTML:false,sheets:chosen.length?chosen:undefined});
 const data=fresh(source);data.sheets=meta.SheetNames;
 const idFor=people(data),basic=workbook.Sheets['学生基础'];
 if(!basic){
  const main=flatWorkbookSheet(XLSX,workbook);
  const result=parseFlat(main?.rows||[],source,mapping);
  result.sheets=meta.SheetNames;
  if(!result.scores.length&&SUBJECTS.some(s=>workbook.Sheets[s])){
   parseItems(data,workbook,XLSX,idFor,progress);
   return examsFrom(data);
  }
  return result;
 }
 progress('提取历次成绩与两类有效线',22);
 const rows=rowsWithMergedColumn(XLSX,basic,rowsOf(XLSX,basic),1);
 const firstScore=rows.findIndex(r=>/[物历]$/.test(txt(r[0]))&&num(r[2])>0&&txt(r[3]));
 const rankHeaders=rows.slice(Math.max(0,firstScore-5),Math.max(0,firstScore));
 const identifierColumn=rankHeaders.reduce((found,row)=>found>=0?found:row.findIndex(v=>identifierHeaders.includes(txt(v).toLowerCase())),-1);
 for(let i=0;i<Math.min(rows.length,50);i++){
  const r=rows[i];if(!/[物历]$/.test(txt(r[1]))||!finite(num(r[2])))continue;
  const t=track(r[1],1),e=code(r[1]),ss=t==='physics'?['语文','数学','英语','物理','化学','生物']:['语文','数学','英语','历史','政治','地理'];
  const subjects=Object.fromEntries(ss.map((s,j)=>[s,{top:num(r[3+j]),under:num(r[12+j])}]));
  subjects['日语']={...subjects['英语'],source:'外语有效线'};
  if(t==='physics')subjects['地理']={...subjects['生物'],source:'物化地对应原表生物列'};
  data.lines.push({exam:e,track:t,top:num(r[2]),under:num(r[11]),subjects});
 }
 const scorePositions=new Map(),schools=new Set(),excludedIdentities=new Set();
 let lastSchool='',acceptedRows=0,excludedRows=0,mergedRows=0;
 for(let i=0;i<rows.length;i++){
  const r=rows[i],n=num(r[2]),name=txt(r[3]);
  if(!/[物历]$/.test(txt(r[0]))||!n||!name||!Number.isInteger(n)||n>99)continue;
  const e=code(r[0]),sourceSchool=txt(r[1]);
  if(sourceSchool){lastSchool=sourceSchool;schools.add(sourceSchool);}
  const school=sourceSchool||lastSchool;
  // The school column is scope, not a data-row requirement. Explicit other
  // schools are excluded; blank merged continuations inherit the last school.
  if(school&&!isOurSchool(school)){excludedRows++;excludedIdentities.add(e+'|'+n+'|'+name);continue;}
  acceptedRows++;
  if(school&&isOurSchool(school))data.school=SCHOOL;
  const t=track(r[0],n),language=txt(r[38]).includes('日语')||n===7?'日语':'英语',subjects={};
  const totalRanks=Object.fromEntries(Object.entries(sourceTotalColumns(rankHeaders,e)).filter(([,v])=>v));
  const fields=[['语文',10,10,11,12],['数学',13,13,14,15],[language,16,16,17,18],[t==='physics'?'物理':'历史',19,19,20,21],['政治',22,23,25,null],['地理',26,27,29,null],['化学',30,31,33,null],['生物',34,35,37,null]];
  for(const [fieldIndex,[s,raw,assigned,ranking,schoolRank]] of fields.entries()){
   // Raw and assigned scores are independent columns. Keep the subject when
   // either one exists; an absent assigned score stays null, never copied.
   const rawValue=num(r[raw]),assignedValue=num(r[assigned]);
   if(rawValue==null&&assignedValue==null)continue;
   const subject=n===9&&s==='生物'?'地理':s;
   const columns=sourceSubjectColumns(rankHeaders,e,raw,(fields[fieldIndex+1]?.[1]??38)-1,ranking,schoolRank);
   subjects[subject]={score:assignedValue,raw:rawValue,rank:Object.values(columns).some(c=>c.column===ranking)?null:num(r[ranking]),...ranksFrom(r,columns)};
  }
  // Scope comes from the source heading, never the exam type or column order.
  const record={exam:e,rawExam:txt(r[0]),sid:idFor(name,identifierColumn>=0?r[identifierColumn]:'',e,n),classNo:n,track:t,total:num(r[5]),rawTotal:num(r[4]),rank:Object.values(totalRanks).some(c=>c.column===7)?null:num(r[7]),...ranksFrom(r,totalRanks),subjects,language,sourceRow:i+1};
  const key=e+'|'+n+'|'+record.sid,index=scorePositions.get(key);
  if(index===undefined){scorePositions.set(key,data.scores.length);data.scores.push(record);}
  else{const prior=data.scores[index],merged=mergeDuplicateScore(prior,record,{onConflict:'collect'});collectImportConflict(data,'score',prior,record,merged.conflicts);data.scores[index]=merged.record;mergedRows++;}
  data.profiles[n]||={...classDefaults(n),track:t};
 }
 data.importReport={...(data.importReport||{}),school:{acceptedRows,excludedRows,names:[...schools]},duplicates:{mergedScores:mergedRows}};
 progress('提取班级目标与任课信息',35);
 for(const name of chosen.filter(n=>/^班级有效人/.test(n))){
  for(const r of rowsOf(XLSX,workbook.Sheets[name])){
   const n=num(r[0]);if(!n||!Number.isInteger(n)||!data.profiles[n])continue;
   if(num(r[3])!=null||num(r[4])!=null)data.profiles[n].targets={top:num(r[3]),under:num(r[4])};
   if(txt(r[1]))data.profiles[n].lead=txt(r[1]);
  }
 }
 if(workbook.Sheets['教师名单']){
  const teacherSubjects=['语文','数学','英语','物理','化学','生物','政治','历史','地理'];
  for(const r of rowsOf(XLSX,workbook.Sheets['教师名单'])){
   const n=num(r[4]);if(!n||!data.profiles[n]||!txt(r[0]).includes('2024'))continue;
   const p=data.profiles[n];p.lead=txt(r[5])||p.lead;
   p.teachers=Object.fromEntries(teacherSubjects.map((s,j)=>[s,txt(r[6+j])]).filter(([,name])=>name));
   if(txt(r[20])&&n<17)p.combination=txt(r[20]);
  }
 }
 parseItems(data,workbook,XLSX,idFor,progress,excludedIdentities);
 const answerSubjects=new Map();
 for(const a of data.answers){const k=a.sid+'|'+a.exam;if(!answerSubjects.has(k))answerSubjects.set(k,new Set());answerSubjects.get(k).add(a.subject);}
 for(const r of data.scores){
  if(![17,18].includes(r.classNo))continue;
  const actual=answerSubjects.get(r.sid+'|'+r.exam);
  if(actual?.has('地理')&&!actual.has('生物')&&r.subjects['生物']&&!r.subjects['地理']){r.subjects['地理']=r.subjects['生物'];delete r.subjects['生物'];}
 }
 progress('整理独立分析工作区',95);
 return examsFrom(data);
}
function parseItems(data,workbook,XLSX,idFor,progress,excludedIdentities=null){
 const subjects=SUBJECTS.filter(s=>workbook.Sheets[s]),known=new Set(data.scores.map(r=>r.exam));
 const scored=new Map(data.scores.map(r=>[r.exam+'|'+r.classNo+'|'+r.sid,r]));
 const answerPositions=new Map(data.answers.map((a,index)=>[a.exam+'|'+a.classNo+'|'+a.sid+'|'+a.subject,index]));
 let mergedAnswers=0;
 subjects.forEach((subject,si)=>{
  progress('读取 '+subject+' 小题、满分与知识点',40+Math.round(si/subjects.length*48));
  const rows=rowsOf(XLSX,workbook.Sheets[subject]),columns={};
  for(let i=0;i<rows.length;i++){
   const r=rows[i];if(txt(r[2])!=='题号')continue;
   const e=code(r[1]);if(known.size&&!known.has(e))continue;
   const metadata=[];
   for(let k=i+1;k<Math.min(rows.length,i+12);k++){
    if(txt(rows[k][2])==='题号'||/[物历]$/.test(txt(rows[k][0]))&&num(rows[k][1])>0)break;
    metadata.push({row:rows[k],index:k});
   }
   const maxRow=metadata.find(m=>/满分|分值|分数/.test(txt(m.row[2])))||metadata.find(m=>m.index===i+1&&m.row.slice(3).some(c=>num(c)!==null));
   const knowledgeRow=metadata.find(m=>/知识|考点|考查|考察|考核内容/.test(txt(m.row[2])))||metadata.find(m=>m.index===i+2&&!num(m.row[1])&&!/满分|分值|分数/.test(txt(m.row[2])));
   const maxima=maxRow?.row||[],knowledge=[...(knowledgeRow?.row||[])],bank=[],cols=[];
   // A merged knowledge cell explicitly applies to its entire column range.
   // Score/max cells are never filled across a merge.
   if(knowledgeRow)for(const merge of workbook.Sheets[subject]['!merges']||[]){
    if(merge.s.r===knowledgeRow.index&&merge.e.r===knowledgeRow.index){
     const value=knowledge[merge.s.c];for(let c=merge.s.c;c<=merge.e.c;c++)if(!txt(knowledge[c]))knowledge[c]=value;
    }
   }
   for(let c=3;c<r.length;c++){
    if(!txt(r[c])||/^(总分|客观分|主观分|原分|赋分|合计)$/.test(txt(r[c])))continue;
    // Keep real question columns even when their metadata is blank, so scores
    // and original positions cannot silently disappear or become misaligned.
    cols.push(c);bank.push({label:txt(r[c]),max:num(maxima[c]),knowledge:txt(knowledge[c]),maxNote:txt(maxima[c]).includes('*')?'原表满分未明确':'',sourceMax:txt(maxima[c])});
   }
   if(bank.length){data.banks[subject+'|'+e]=bank;columns[e]=cols;}
  }
  for(const r of rows){
   const n=num(r[1]),name=txt(r[2]),e=code(r[0]);if(!/[物历]$/.test(txt(r[0]))||!n||!name||!columns[e])continue;
   if(excludedIdentities?.has(e+'|'+n+'|'+name))continue;
   const sid=idFor(name,'',e,n),score=scored.get(e+'|'+n+'|'+sid);
   if(data.scores.length&&!score)continue;
   if(subject==='英语'&&score?.language==='日语')continue;
   const values=columns[e].map(c=>num(r[c]));if(!values.some(finite))continue;
   const answer={exam:e,sid,classNo:n,track:score?.track||track(r[0],n),subject,values};
   const key=e+'|'+n+'|'+sid+'|'+subject,index=answerPositions.get(key);
   if(index===undefined){answerPositions.set(key,data.answers.length);data.answers.push(answer);}
   else{const prior=data.answers[index],merged=mergeDuplicateAnswer(prior,answer,{onConflict:'collect'});collectImportConflict(data,'answer',prior,answer,merged.conflicts);data.answers[index]=merged.record;mergedAnswers++;}
   data.profiles[n]||=classDefaults(n);
  }
 });
 if(mergedAnswers){
  const report=data.importReport||{};
  report.duplicates={...(report.duplicates||{}),mergedAnswers};
  data.importReport=report;
 }
}
export const FLAT_FIELDS=[['name','姓名'],['studentId','学生识别码'],['classNo','班级'],['exam','考试'],['total','赋分总分'],['rawTotal','原始总分'],['track','类别'],['language','外语语种'],['cityRank','市排名'],['schoolRank','校排名'],['classRank','班级排名'],...SUBJECTS.map(s=>[s,s+'成绩'])];
const ALIASES={studentId:identifierHeaders,name:['姓名','学生姓名','name'],classNo:['班级','班号','行政班','class','classno'],exam:['考次代码','考试代码','examid','考试','考试名称','考次','exam'],total:['赋分总分','总赋分','总分','total'],rawTotal:['原始总分','原分总分','原始分'],track:['类别','科类','track'],language:['外语语种','语种','language'],cityRank:['市赋名','市排名','市名次','全市名次','市原名','cityrank'],schoolRank:['校赋名','校排名','校名次','校排','校内排名','年级排名','年级名次','校原名','schoolrank'],classRank:['班赋名','班级排名','班排名','班排','班内排名','班原名','classrank']};
function flatRankMapping(headers){
 const scopes={全市:'cityRank',市级:'cityRank',市内:'cityRank',市:'cityRank',学校:'schoolRank',校内:'schoolRank',校:'schoolRank',年级:'schoolRank',班级:'classRank',班内:'classRank',班:'classRank'},selected={};
 headers.forEach((label,column)=>{
  const text=label.normalize('NFKC').replace(/[\s()]/g,''),match=text.match(/^(?:总分)?(?:原始分|原分|赋分)?(全市|市级|市内|市|学校|校内|校|年级|班级|班内|班)(?:原始分|原分|赋分|原|赋)?(?:排名|名次|排|名)(?:原始分|原分|赋分)?$/),scope=match?scopes[match[1]]:['cityRank','schoolRank','classRank'].find(key=>ALIASES[key].includes(text.toLowerCase()));
  if(!scope)return;const priority=/赋/.test(text)?3:/原/.test(text)?1:2;
  if(!selected[scope]||priority>selected[scope].priority)selected[scope]={column,label,priority};
 });return selected;
}
export function detectFlat(rows){
 const headerRow=rows.findIndex(r=>r.some(c=>['姓名','学生姓名','name'].includes(txt(c).toLowerCase())));
 const rowIndex=headerRow<0?0:headerRow,headers=(rows[rowIndex]||[]).map(txt),mapping={};
 for(const [key] of FLAT_FIELDS){
  const aliases=ALIASES[key]||[key,key+'成绩',key+'赋分',key+'折合分',key+'折合成绩'];
  mapping[key]=['schoolRank','classRank','cityRank','exam'].includes(key)?aliases.map(alias=>headers.findIndex(h=>h.toLowerCase()===alias)).find(i=>i>=0)??-1:headers.findIndex(h=>aliases.includes(h.toLowerCase()));if(mapping[key]<0)mapping[key]=null;
 }
 const rankCandidates=flatRankMapping(headers);for(const key of ['cityRank','schoolRank','classRank'])mapping[key]=rankCandidates[key]?.column??null;
 for(const subject of SUBJECTS){const column=headers.findIndex(header=>[subject+'原分',subject+'原始分',subject+'原始成绩'].includes(header));mapping['raw:'+subject]=column<0?null:column;}
 return {headers,mapping,headerRow:rowIndex,preview:rows.slice(rowIndex+1,rowIndex+6)};
}
export function parseFlat(rows,source,mapping=null){
 const data=fresh(source),idFor=people(data),auto=detectFlat(rows),positions=new Map();let mergedRows=0;mapping||=auto.mapping;
 const ranks=Object.fromEntries(['schoolRank','classRank','cityRank'].filter(key=>mapping[key]!=null&&mapping[key]!==''&&Number.isInteger(Number(mapping[key]))&&Number(mapping[key])>=0).map(key=>[key,{column:Number(mapping[key]),label:auto.headers[Number(mapping[key])]||FLAT_FIELDS.find(([field])=>field===key)[1]}]));
 for(const row of rows.slice(auto.headerRow+1)){
  const val=k=>mapping[k]==null||mapping[k]===''?null:row[Number(mapping[k])];
  const name=txt(val('name')),n=num(txt(val('classNo')).replace(/[^\d]/g,''));if(!name||!n)continue;
  const e=code(val('exam'))||'本次',category=txt(val('track')).toLowerCase(),t=category==='history'||category.includes('历')?'history':category==='physics'||category.includes('物')?'physics':track(val('exam'),n),subjects={};
  for(const s of SUBJECTS){const v=num(val(s)),rawColumn=Object.hasOwn(mapping,'raw:'+s)?mapping['raw:'+s]:auto.mapping['raw:'+s],raw=rawColumn==null?null:num(row[Number(rawColumn)]);if(v!=null||raw!=null)subjects[s]={score:v,raw,rank:null,schoolRank:null};}
  const rankValues=ranksFrom(row,ranks,{provenance:'column-headings-v2'}),basisColumn=auto.headers.indexOf('排名及统计口径');
  // An exported analysis may contain a calculated class position. On import it
  // must not become a supplied source rank that freezes after more rows arrive.
  if(basisColumn>=0&&ranks.classRank?.label==='班排名'&&txt(row[basisColumn]).includes('班排按同班同考次有效总分降序，同分并列')){rankValues.classRank=null;delete rankValues.rankSources.classRank;}
  const record={exam:e,rawExam:txt(val('exam')),sid:idFor(name,val('studentId'),e,n),classNo:n,track:t,total:num(val('total')),rawTotal:num(val('rawTotal')),...rankValues,subjects,language:txt(val('language'))|| (subjects['日语']?'日语':subjects['英语']?'英语':'')};
  const key=e+'|'+n+'|'+record.sid,index=positions.get(key),previous=index===undefined?null:data.scores[index];
  if(previous){const merged=mergeDuplicateScore(previous,record,{onConflict:'collect'});collectImportConflict(data,'score',previous,record,merged.conflicts);data.scores[index]=merged.record;mergedRows++;}
  else{positions.set(key,data.scores.length);data.scores.push(record);}
  data.profiles[n]||={...classDefaults(n),track:t};
 }
 if(mergedRows)data.importReport={...(data.importReport||{}),duplicates:{mergedScores:mergedRows}};
 return examsFrom(data);
}
export function adaptJSON(json,source){
 if(Array.isArray(json))return parseFlat([Object.keys(json[0]||{}),...json.map(r=>Object.keys(json[0]||{}).map(k=>r[k]))],source);
 if(json.schemaVersion===1&&Array.isArray(json.students))return normalizeDataset({...json,sourceName:source,importedAt:new Date().toISOString()});
 if(!Array.isArray(json.scores))throw new Error('JSON 中没有可导入的成绩。请导入见微数据备份或原项目的 GradeDataset 数据。');
 const data=fresh(source),idFor=people(data);
 data.school=json.school||data.school;data.sheets=json.sheets||[];
 for(const r of json.scores){const n=Number(r.classNo),e=code(r.exam),p=classDefaults(n);data.profiles[n]={...p,type:r.classType||p.type,combination:r.combination||p.combination};data.scores.push({exam:e,rawExam:r.rawExam||r.exam,sid:idFor(r.name,r.studentId??r.queryId,e,n),classNo:n,track:r.track?.includes('历史')?'history':p.track,total:num(r.total),rawTotal:null,cityRank:num(r.cityRank),schoolRank:num(r.schoolRank),classRank:num(r.classRank),language:r.subjects?.['日语']!=null?'日语':'英语',subjects:Object.fromEntries(Object.entries(r.subjects||{}).map(([s,v])=>[s,{score:num(v),raw:null,rank:null,schoolRank:null}]))});}
 for(const l of json.thresholds||[])data.lines.push({exam:code(l.exam),track:l.track?.includes('历史')?'history':'physics',top:num(l.topTotal),under:num(l.undergraduateTotal),subjects:Object.fromEntries(SUBJECTS.map(s=>[s,{top:num(l.topSubjects?.[s]),under:num(l.undergraduateSubjects?.[s])}]))});
 for(const [key,bank] of Object.entries(json.questionBanks||{})){const parts=key.split(/[|:]/).filter(Boolean),subject=SUBJECTS.find(s=>parts.includes(s));const e=parts.find(s=>s!==subject);if(subject&&e)data.banks[subject+'|'+code(e)]=bank.map(q=>({label:txt(q.question),max:q.maxScoreSource==='inferred'?null:num(q.maxScore),knowledge:txt(q.knowledge),maxNote:q.maxScoreSource==='inferred'?'原备份满分为推断值，待明确':''}));}
 for(const a of json.itemResponses||[])data.answers.push({exam:code(a.exam),sid:idFor(a.name,a.studentId??a.queryId,code(a.exam),Number(a.classNo)),classNo:Number(a.classNo),track:classDefaults(Number(a.classNo)).track,subject:a.subject,values:(a.scores||[]).map(num)});
 return examsFrom(data);
}
// Merge means supplement: blank input does not erase existing measurements.
// Rank invalidation is handled by merge-policy so raw-score corrections only
// clear ranks recorded against raw scores.
function mergeScore(previous,incoming) {
 const result=mergeScoreRecord(previous,incoming);if(!previous)return result;
 // An explicit new column scope repairs old positional assumptions, even when
 // the total score itself has not changed.
 if(Object.keys(incoming.rankSources||{}).length&&!Object.keys(previous.rankSources||{}).length){for(const key of ['schoolRank','classRank','cityRank'])result[key]=incoming[key]??null;}
 if(previous.sourceRow&&!explicitRanks(previous))for(const [subject,record] of Object.entries(incoming.subjects||{})){
  if(explicitRanks(record))for(const key of ['schoolRank','classRank','cityRank'])result.subjects[subject][key]=record[key]??null;
 }
 return result;
}
const examDefault=id=>({label:EXAM_NAMES[id]||id,scope:cityExam(id)?'city':'school',order:EXAM_ORDER.includes(id)?EXAM_ORDER.indexOf(id):99});
function mergeExamMetadata(current,incoming) {
 const defaults=examDefault(current.id),result={...current};
 for(const key of ['label','scope','order']) {
  const value=current[key],configured=current.manuallyConfigured===true||(value!=null&&value!==''&&value!==defaults[key]);
  // Teacher-maintained exam labels, order and city/school scope survive a
  // routine merge. An import may still update a field that is only default.
  if(configured)continue;
  if(incoming[key]!=null&&incoming[key]!=='')result[key]=incoming[key];
  else if(result[key]==null)result[key]=defaults[key];
 }
 return result;
}
function mergeLine(previous,incoming){return previous?supplement(previous,incoming):structuredClone(incoming);}
function mergePapers(data,incoming,usable) {
 const alignments=new Map();
 for(const [key,newBank] of Object.entries(incoming.banks)) {
  const oldBank=data.banks[key];if(!oldBank?.length){data.banks[key]=structuredClone(newBank);continue;}if(!newBank.length)continue;
  const oldLabels=oldBank.map(q=>txt(q.label)),newLabels=newBank.map(q=>txt(q.label));
  if(JSON.stringify(oldLabels)===JSON.stringify(newLabels)){data.banks[key]=oldBank.map((q,i)=>supplement(q,newBank[i]));continue;}
  if([...oldLabels,...newLabels].some(label=>!label)||new Set(oldLabels).size!==oldLabels.length||new Set(newLabels).size!==newLabels.length)throw new Error(key.replace('|',' · ')+' 存在空题号或重复题号，无法唯一对应。请先补齐唯一题号，再合并；原工作区未改动。');
  const oldIndex=new Map(oldLabels.map((label,i)=>[label,i])),newIndex=new Map(newLabels.map((label,i)=>[label,i])),labels=[...newLabels,...oldLabels.filter(label=>!newIndex.has(label))];
  data.banks[key]=labels.map(label=>supplement(oldBank[oldIndex.get(label)],newBank[newIndex.get(label)]));
  alignments.set(key,{old:labels.map(label=>oldIndex.get(label)),incoming:labels.map(label=>newIndex.get(label))});
 }
 const aligned=(answer,side)=>{const indices=alignments.get(answer.subject+'|'+answer.exam)?.[side];return indices?{...answer,values:indices.map(index=>index===undefined?null:answer.values[index]??null)}:answer;};
 const identity=a=>a.exam+'|'+a.classNo+'|'+a.sid+'|'+a.subject;
 const answers=new Map(data.answers.map(a=>{const row=aligned(a,'old');return [identity(row),row];}));
 for(const answer of incoming.answers) {
  const row=aligned(usable(answer),'incoming'),old=answers.get(identity(row));
  if(old)row.values=supplementAnswerValues(old.values,row.values);
  answers.set(identity(row),row);
 }
 data.answers=[...answers.values()];
}
export function mergeDatasets(current,incoming){
 if(current.anonymous&&!incoming.anonymous&&incoming.scores.length)return normalizeDataset(incoming);
 const data=normalizeDataset(structuredClone(current));incoming=normalizeDataset(structuredClone(incoming));
 const remap=mergeStudentIdentities(data,incoming);
 if(incoming.importConflicts?.length)data.importConflicts=[...(data.importConflicts||[]),...incoming.importConflicts.map(group=>({...group,previous:{...group.previous,sid:remap.get(group.previous.sid)||group.previous.sid},incoming:{...group.incoming,sid:remap.get(group.incoming.sid)||group.incoming.sid},conflicts:group.conflicts.map(item=>({...item,sid:remap.get(item.sid)||item.sid}))}))];
 const usable=p=>({...p,sid:remap.get(p.sid)||p.sid});
 const identity=r=>r.exam+'|'+r.classNo+'|'+r.sid,scores=new Map(data.scores.map(r=>[identity(r),r]));
 for(const score of incoming.scores){const row=usable(score);scores.set(identity(row),mergeScore(scores.get(identity(row)),row));}data.scores=[...scores.values()];
 mergePapers(data,incoming,usable);
 data.profiles={...data.profiles,...Object.fromEntries(Object.entries(incoming.profiles).map(([n,p])=>{const old=data.profiles[n];if(old?.manuallyConfigured||old&&!incoming.scores.length)return [n,old];return [n,{...old,...p,lead:p.lead||old?.lead||'',teachers:{...old?.teachers,...Object.fromEntries(Object.entries(p.teachers||{}).filter(([,v])=>v))},targets:p.targets?.top==null&&p.targets?.under==null?old?.targets:p.targets}];}))};
 const lines=new Map(data.lines.map(line=>[line.exam+'|'+line.track,line]));
 for(const line of incoming.lines){const key=line.exam+'|'+line.track;lines.set(key,lines.has(key)?mergeLine(lines.get(key),line):structuredClone(line));}
 data.lines=[...lines.values()];
 const exams=new Map(data.exams.map(exam=>[exam.id,exam]));
 for(const exam of incoming.exams){const old=exams.get(exam.id);exams.set(exam.id,old?mergeExamMetadata(old,exam):structuredClone(exam));}
 data.exams=[...exams.values()];
 data.sheets=[...new Set([...data.sheets,...incoming.sheets])];data.sourceName=incoming.sourceName;data.importedAt=incoming.importedAt;data.anonymous=current.anonymous&&incoming.anonymous;
 Object.assign(data,mergeContext(current,incoming,remap));
 return normalizeDataset(data);
}
