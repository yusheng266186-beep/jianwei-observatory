import {button,esc,empty} from './html.js?v=runtime-v42';
import {directoryViewName} from '../engine/directory.js?v=runtime-v42';
import {dockIcon} from './icons.js?v=runtime-v42';

const scenes={board:'年级总览',class:'班级研究',papers:'试卷研究',people:'学生研究',follow:'教学跟进',library:'资料与报告'};
const labels={overview:'本场概况',map:'逐题地图',targets:'有效与任务',subjects:'学科研究',history:'阶段对比',roster:'完整名单',snapshot:'本场剖面',knowledge:'知识点路径',classes:'班级热力',details:'逐题明细',students:'学生作答',responses:'单题作答',materials:'材料与备份',lines:'有效线',papers:'题目资料',exams:'考次与口径',notebook:'证据报告'};
export function studyDescription(atlas,study) {
  const {scene,values:s,drawer}=study,exam=id=>atlas.exams.find(e=>e.id===id)?.label||id||'每人最新';
  let title=scenes[scene]||'研究记录',scope='';
  if(scene==='board'){title=({overview:'本场概况',map:'班级分布',targets:'班级有效账',subjects:'学科有效',history:'年级阶段对比',roster:'完整成绩名册'}[s.mode])||'年级研究';scope=exam(s.exam)+(s.mode==='subjects'&&s.subject?' · '+s.subject:'');}
  if(scene==='class'){title=s.no+'班 · '+(labels[s.tab]||'班级研究');scope=s.tab==='history'?(s.exams||[]).map(exam).join(' / '):exam(s.exam);}
  if(scene==='papers'){const paper=atlas.papers().find(p=>p.key===s.key);title=paper?paper.subject+' · '+(labels[s.tab]||'试卷研究'):'试卷资料架';scope=paper?exam(paper.exam)+' · '+(s.classes?.length?s.classes.map(n=>n+'班').join('、'):'全部参考班'):s.shelfExam==='all'?'全部考试':exam(s.shelfExam||atlas.latest);if(paper&&(!s.tab||s.tab==='map'))scope+=(s.questionFocus&&s.questionFocus!=='all'?' · '+({low:'低得分率',missing:'作答未齐',max:'满分待补'}[s.questionFocus]||'全部题目'):'')+(s.questionSearch?.trim()?' · 检索 '+s.questionSearch.trim():'')+(s.order==='loss'?' · 按平均失分':'');}
  if(scene==='people'){title=s.sid?atlas.name(s.sid)+' · 学生档案':directoryViewName(s);scope=s.sid?exam(s.exam):'学生目录 · '+({cards:'卡片',table:'表格',landscape:'分布图'}[s.view]||'研究视图');}
  if(scene==='follow')scope=exam(s.exam)+' · '+(s.tier==='top'?'特控':'本科')+'临界';
  if(scene==='library'){title=s.tab==='classes'?'班级与任务':labels[s.tab]||'资料与报告';scope=s.tab==='lines'?exam(s.lineExam):'资料整理';}
  if(drawer?.type==='person'){title=atlas.name(drawer.sid)+' · '+({overview:'阶段线索',subjects:'学科成绩',questions:'逐题得分'}[drawer.tab]||'学生观察');scope=exam(drawer.exam)+' · 从'+scenes[scene]+'展开';}
  if(drawer?.type==='question'){const paper=atlas.papers().find(p=>p.key===drawer.key),q=paper?.questions[Number(drawer.question)];title=(paper?.subject||'试卷')+' · 第'+(q?.label??Number(drawer.question)+1)+'题';scope=exam(paper?.exam)+' · '+(drawer.classes?.length?drawer.classes.map(n=>n+'班').join('、'):'全部参考班');}
  if(drawer?.type==='compare'){title=(study.comparePeople||[]).map(sid=>atlas.name(sid)).join('、')+' · 并排研究';scope=drawer.context==='latest'?'每人最新':exam(drawer.context);}
  if(drawer?.type==='subject'){title=drawer.no+'班 · '+drawer.subject+'学科研究';scope=exam(drawer.exam)+' · '+(drawer.tier==='top'?'特控':'本科')+'口径';}
  if(drawer?.type==='knowledge'){const paper=atlas.papers().find(p=>p.key===drawer.key);title=drawer.knowledge+' · 知识点研究';scope=(paper?.subject||'试卷')+' · '+exam(paper?.exam)+' · '+(drawer.classes?.length?drawer.classes.map(n=>n+'班').join('、'):'全部参考班');}
  return {title,scope,scene:scenes[scene]||'研究记录'};
}
export function studyAvailable(atlas,study) {
  if(!study||!scenes[study.scene]||!study.values)return false;
  const s=study.values,hasExam=id=>!id||['latest','all'].includes(id)||atlas.exams.some(e=>e.id===id),person=(sid,exam)=>atlas.people.has(sid)&&(!exam||Boolean(atlas.materialAt(sid,exam))),paper=key=>atlas.papers().find(p=>p.key===key);
  const relevant=study.scene==='people'?[s.sid?s.exam:s.directoryExam]:study.scene==='papers'?[s.key?undefined:s.shelfExam]:study.scene==='library'?[s.tab==='lines'?s.lineExam:undefined]:[s.exam];
  if(!relevant.every(hasExam))return false;
  if(study.scene==='class'&&!atlas.classes.includes(Number(s.no)))return false;
  if(s.sid&&!person(s.sid,s.exam))return false;
  if(s.key&&!paper(s.key))return false;
  if((s.classes||[]).some(no=>!atlas.classes.includes(Number(no)))||(s.exams||[]).some(id=>!hasExam(id)))return false;
  for(const d of [study.drawer,...(study.trail||[])].filter(Boolean)) {
    if(!['person','question','compare','subject','knowledge'].includes(d.type))return false;
    if(d.type==='person'&&!person(d.sid,d.exam))return false;
    if(d.type==='question'&&(!Number.isInteger(Number(d.question))||!paper(d.key)?.questions[Number(d.question)]))return false;
    if(d.type==='compare'&&((study.comparePeople||[]).length<2||(study.comparePeople||[]).some(sid=>!atlas.people.has(sid))||!hasExam(d.context)))return false;
    if(d.type==='subject'&&(!atlas.classes.includes(Number(d.no))||!hasExam(d.exam)||!atlas.comparisonSubjects(atlas.classAt(d.no,d.exam)).includes(d.subject)))return false;
    if(d.type==='knowledge'&&!paper(d.key)?.questions.some(q=>(q.knowledge||'未标注').split(/[,，;；]/).map(s=>s.trim()).includes(d.knowledge)))return false;
    if((d.classes||[]).some(no=>!atlas.classes.includes(Number(no))))return false;
  }
  return true;
}
function ordered(value) {
  if(Array.isArray(value))return value.map(ordered);
  return value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
}
export function studyKey(study) {
  const drawer=study.drawer?{...study.drawer}:null;if(drawer){delete drawer.scrollTop;delete drawer.tablePositions;}
  const trail=(study.trail||[]).map(({scrollTop,tablePositions,...context})=>context),comparing=drawer?.type==='compare'||trail.some(d=>d.type==='compare');
  return JSON.stringify(ordered({scene:study.scene,values:study.values,drawer,trail,comparePeople:comparing?study.comparePeople:undefined}));
}
const date=value=>{try{return new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));}catch{return '';}};
export function researchView(atlas,research,state,current) {
  const tab=state.tab==='recent'?'recent':'saved',query=(state.search||'').trim(),entries=research[tab].filter(entry=>!query||[entry.name,entry.title,entry.scope].some(v=>String(v||'').includes(query))),active=current&&studyDescription(atlas,current);
  const cards=entries.map(entry=>{
    const available=studyAvailable(atlas,entry),detail=available?studyDescription(atlas,entry):{title:entry.title,scope:entry.scope,scene:scenes[entry.scene]},name=entry.name||detail.title;
    return '<article class="research-entry" data-motion-key="study-'+esc(entry.id)+'"><span class="research-entry-icon" aria-hidden="true">'+dockIcon(entry.scene)+'</span><div class="research-entry-copy"><span>'+esc(detail.scene)+' · '+date(entry.updated)+'</span><h3>'+esc(name)+'</h3><p>'+esc(detail.scope)+'</p>'+(!available?'<small class="research-unavailable">对应材料尚未导入</small>':'')+'</div><div class="research-entry-actions">'+button(tab==='saved'?'继续研究 ↗':'重新打开 ↗','research-open',{id:entry.id,collection:tab},'study-open',available?'':'disabled')+(tab==='recent'?button('☆','research-pin-entry',{id:entry.id},'research-entry-small','aria-label="将这条足迹留在研究夹"'):button('改名','research-rename',{id:entry.id},'research-entry-small'))+button('×','research-remove',{id:entry.id,collection:tab},'research-entry-small','aria-label="移除这条研究记录"')+'</div></article>';
  }).join('');
  const renaming=research.saved.find(e=>e.id===state.rename);
  return '<div class="inbox-top"><span class="overline">荣县第一中学高三成绩分析 / 研究夹</span>'+button('×','research-close',{},'icon-only','aria-label="收起研究夹"')+'</div><div class="research-heading"><h2 id="research-title">把值得追的线索，<br><span>留在手边。</span></h2><p>留下观察范围，下一次接着研究。</p></div>'+(active?'<section class="research-current"><div><span class="overline">正在研究</span><h3>'+esc(active.title)+'</h3><p>'+esc(active.scope)+'</p></div>'+button('☆ 留下此处','research-pin',{},'accent')+'</section>':'')+(renaming?'<form data-form="research-name" data-id="'+esc(renaming.id)+'" class="research-name-form"><label class="field"><span>给这条线索命名</span><input name="study-name" maxlength="100" value="'+esc(renaming.name||renaming.title)+'" required></label><button class="button accent" type="submit">保存名字</button>'+button('取消','research-name-cancel',{},'quiet')+'</form>':'')+'<div class="research-tabs"><div role="group" aria-label="研究记录">'+button('留下的线索 <small>'+research.saved.length+'</small>','research-tab',{tab:'saved'},tab==='saved'?'selected':'','aria-pressed="'+(tab==='saved')+'"')+button('最近足迹 <small>'+research.recent.length+'</small>','research-tab',{tab:'recent'},tab==='recent'?'selected':'','aria-pressed="'+(tab==='recent')+'"')+'</div><input type="search" data-research-search="true" placeholder="找一条线索" value="'+esc(state.search||'')+'" aria-label="检索研究夹"></div><div class="research-entries">'+(cards||empty(query?'没有找到这条线索':tab==='saved'?'让好线索留下来':'从一页研究开始',query?'换个关键词，再看看。':'打开班级、学生或一道试题后，可以随时留在这里。'))+'</div><p class="research-footnote">保存视图条件与阅读位置，重新打开时按当前材料呈现；证据摘录另外保存当时的结果。最近足迹保留24条，记录随完整工作区备份一起带走。</p>';
}
