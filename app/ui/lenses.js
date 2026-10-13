import {button,block,table,ribbon,number,integer,percent,delta,esc,empty} from './html.js?v=reports-v24';
import {trajectory,bars,chartButtons} from './plots.js?v=reports-v24';
import {subjectLens,skillLens} from '../engine/lenses.js?v=reports-v24';
import {scoreTone,scoreStyle} from './score-tones.js?v=reports-v24';
import {valid} from '../engine/metrics.js?v=reports-v24';
import {evidence,scoreRows} from '../io/exports.js?v=reports-v24';

const tabs=(options,value)=>'<nav class="drawer-tabs lens-tabs" aria-label="观察视角">'+options.map(([id,label])=>button(label,'drawer-tab',{value:id},id===value?'chip selected':'chip','aria-pressed="'+(id===value)+'"')).join('')+'</nav>';
const filters=(items,value)=>'<div class="lens-filters" role="group" aria-label="当前观察窗的名单条件">'+items.map(item=>button('<span>'+esc(item.label)+'</span><b>'+integer(item.count)+'</b>','lens-filter',{value:item.id},item.id===value?'lens-filter selected':'lens-filter','aria-pressed="'+(item.id===value)+'"')).join('')+'</div>';
function paging(matches,state) {
  const pages=Math.max(1,Math.ceil(matches.length/30)),page=Math.min(state.page||1,pages);
  return {page,shown:matches.slice((page-1)*30,page*30),html:'<div class="pagination">'+button('←','lens-page',{step:-1},'outline',page<=1?'disabled':'')+'<span>'+page+' / '+pages+' · 共 '+matches.length+' 人</span>'+button('→','lens-page',{step:1},'outline',page>=pages?'disabled':'')+'</div>'};
}
function rosterTools(state,count,total,label) {
  return '<div class="lens-roster-tools"><input type="search" data-drawer-field="search" value="'+esc(state.search||'')+'" placeholder="在这份名单中找学生" aria-label="观察窗名单检索"><div>'+[['low','低分在前'],['high','高分在前'],['name','按姓名']].map(([id,text])=>button(text,'lens-sort',{value:id},(state.sort||'low')===id?'chip selected':'chip','aria-pressed="'+((state.sort||'low')===id)+'"')).join('')+'</div><p><b>'+esc(label)+'</b> · '+count+' / '+total+' 人</p></div>';
}
const student=(atlas,sid,exam)=>button(esc(atlas.name(sid)),'peek',{sid,exam},'person-link');
function scope(tokens,note='') {return '<div class="lens-scope">'+tokens.map(token=>'<span>'+esc(token)+'</span>').join('')+(note?'<p>'+esc(note)+'</p>':'')+'</div>';}
const actions=()=>'<div class="drawer-actions">'+button('保存证据摘录','drawer-capture',{},'outline')+button('导出完整材料','drawer-export',{},'quiet')+'</div>';

export function subjectView(atlas,state) {
  const model=subjectLens(atlas,state),{no,subject,tier,own,peers,snapshot,entries,matches,papers,timeline}=model,tab=state.tab||'students',tierLabel=tier==='top'?'特控':'本科',page=paging(matches,state);
  const head='<header class="drawer-title"><div class="overline">班级学科 / 证据观察</div><h2 id="drawer-title">'+no+'班的'+esc(subject)+'</h2><p>'+esc(atlas.teacher(no,subject)||'任课教师未填写')+' · '+esc(atlas.exam(state.exam).label)+'</p>'+actions()+'</header>'+scope([no+'班',snapshot.profile.track==='physics'?'物理类':'历史类',atlas.exam(state.exam).label,subject==='外语'?'统一折合外语':'表内折合成绩'],'上方概况使用本班本场全部记录，名单条件只作用于下方名单。同科类参照包含17、18班。')+ribbon([['学科均分',number(own.mean),own.count+' 份成绩 · 缺 '+own.missing+' 份'],['同类基准差',delta(model.distance),'同科类均分 '+number(peers.mean)],['学科'+tierLabel+'达线',integer(own[tier]),own[tier+'Base']+' 人可判定'],['总分与学科双上线',integer(model.dualPass),model.dualBase+' 人可判定 · 口径不全 '+model.filters.find(f=>f.id==='unknown').count+' 人']])+tabs([['students','具体学生'],['history','历次参照'],['papers','相关小题']],tab);
  let body='';
  if(tab==='history') {
    body=block('这个学科，历次的位置',trajectory('lens-subject-story',timeline.map(t=>t.exam.id),[{name:no+'班',values:timeline.map(t=>t.own.mean),points:timeline.map(t=>({cmd:'lens-exam',data:{exam:t.exam.id}}))},{name:'同科类基准',values:timeline.map(t=>t.peers.mean),color:'#7899b5'}]),'点击节点观察对应考次；各场原始均分保留，考试难度与参考学生可能不同。',chartButtons('lens-subject-story'))+block('逐场参照',table(['考次','有效成绩','缺学科成绩','班级均分','同类均分','基准差'],timeline.map(t=>[button(esc(t.exam.label),'lens-exam',{exam:t.exam.id},'person-link'),integer(t.own.count),integer(t.own.missing),number(t.own.mean),number(t.peers.mean),delta(valid(t.own.mean)&&valid(t.peers.mean)?t.own.mean-t.peers.mean:null)]),{label:'班级学科历次参照'}));
  } else if(tab==='papers') {
    body=block('把学科差异，追到题目里',papers.length?'<div class="lens-paper-grid">'+papers.map(p=>{
      const part=atlas.paper(p.key,[no]);return '<article><header><span>'+esc(p.subject)+'</span><small>'+part.answers.length+' 份作答</small></header><h3>'+esc(atlas.exam(p.exam).label)+'</h3><p>'+p.questions.length+' 道小题 · 本班材料</p><div>'+button('研究这张卷 ↗','lens-paper',{key:p.key,no},'outline')+'</div><div class="lens-skill-links">'+part.skills.map(s=>button(esc(s.name)+' <small>'+percent(s.rate)+'</small>','knowledge-open',{key:p.key,knowledge:s.name,no},'lens-skill-link')).join('')+'</div></article>';
    }).join('')+'</div>':empty('本班本场暂无这个学科的小题','可以补充小题材料，学科成绩仍可独立研究。'),'英语与日语在学科成绩中统一比较；各自题目继续按原试卷呈现。');
  } else {
    const quadrants=model.filters.filter(f=>['double','subjectOnly','totalOnly','bothBelow'].includes(f.id));
    body='<section class="lens-insight"><div><span class="overline">从达线关系找学生</span><h3>总分与学科，分别在哪一侧？</h3><p>点击一种关系，直接查看对应名单。</p></div><div class="chips">'+[['under','本科口径'],['top','特控口径']].map(([id,label])=>button(label,'lens-tier',{value:id},tier===id?'chip selected':'chip','aria-pressed="'+(tier===id)+'"')).join('')+'</div>'+filters(quadrants,state.filter||'all')+'<span class="lens-insight-note">另有 '+model.filters.find(f=>f.id==='unknown').count+' 人缺少成绩或有效线，保留在名单中。</span></section>';
    body+=block('学科线索名单',filters(model.filters.filter(f=>!['double','subjectOnly','totalOnly','bothBelow'].includes(f.id)),state.filter||'all')+rosterTools(state,matches.length,entries.length,model.selected)+(matches.length?table(['学生','语种','折合学科分','原分','原考试排名','学科'+tierLabel+'距线','总分'+tierLabel+'距线'],page.shown.map(e=>[student(atlas,e.row.sid,state.exam),esc(e.row.language||'未填写'),number(e.score),number(e.raw),integer(e.rank),delta(e.subjectGap),delta(e.totalGap)]),{label:no+'班'+subject+'线索名单'})+page.html:empty('这个条件下没有学生','切换关系或清空姓名检索，继续查看。')),'名单保留本班本场所有记录。缺失不补0；原排名沿用本场统计范围。');
  }
  return head+'<div class="drawer-panel" data-render-key="subject-panel-'+tab+'">'+body+'</div><div class="lens-exit">'+button('查看年级'+esc(subject)+'比较 ↗','subject-open',{subject,exam:state.exam},'quiet')+'</div>';
}

export function knowledgeView(atlas,state) {
  const model=skillLens(atlas,state),{lens,skill,questions,entries,matches,max}=model,tab=state.tab||'questions',page=paging(matches,state);if(!skill)return '<h2 id="drawer-title">知识点材料尚未导入</h2>'+empty('暂时没有这个知识点','请返回原试卷，选择已有知识点或补充材料。');
  const complete=entries.filter(e=>e.rate!==null).length,head='<header class="drawer-title"><div class="overline">知识点 / 证据观察</div><h2 id="drawer-title">'+esc(skill.name)+'</h2><p>'+esc(lens.subject)+' · '+esc(atlas.exam(lens.exam).label)+'</p>'+actions()+'</header>'+scope([lens.subject,atlas.exam(lens.exam).label,state.classes?.length?state.classes.map(no=>no+'班').join('、'):'全部参考班'],'只观察这张卷中关联该知识点的题目；名单沿用当前试卷的班级范围。')+ribbon([['关联小题',integer(questions.length),'明确满分 '+number(max)],['有效部分得分率',percent(skill.rate),'按已有样本与明确满分加权'],['可比作答',integer(complete),'关联题得分与满分均齐全'],['无法计算得分率',integer(entries.length-complete),'缺作答或缺明确满分']])+tabs([['questions','关联题目'],['students','具体学生'],['classes','班级差异']],tab);
  let body='';
  if(tab==='students') {
    body=block('这个知识点，谁值得继续观察',filters(model.filters,state.filter||'all')+rosterTools(state,matches.length,entries.length,model.selected)+(matches.length?table(['学生','班级','已填得分','作答进度','完整得分率','可计算失分',...questions.map(q=>q.label+'题')],page.shown.map(e=>[student(atlas,e.answer.sid,lens.exam),e.answer.classNo+'班',number(e.total),e.filled+' / '+questions.length,percent(e.rate),number(e.loss),...e.values.map(v=>number(v))]),{label:skill.name+'关联小题作答'})+page.html:empty('这个条件下没有作答','可以切换观察条件，查看全部材料。')),'优先研究低于 '+percent(model.low)+'；继续巩固为 '+percent(model.low)+' 至 '+percent(model.focus)+' 以下。作答或满分不齐时，保留已填得分，完整得分率与失分留空。');
  } else if(tab==='classes') {
    const classes=[...new Set(entries.map(e=>e.answer.classNo))].sort((a,b)=>a-b),rows=classes.map(no=>{const part=entries.filter(e=>e.answer.classNo===no),known=part.filter(e=>e.rate!==null);return {no,count:part.length,known:known.length,rate:known.length?known.reduce((total,e)=>total+e.total,0)/(known.length*max):null};});
    body=block('同一组题，各班的完整作答',bars('lens-knowledge-classes',rows.map(r=>({label:r.no+'班',value:r.rate,cmd:'knowledge-class',data:{no:r.no}})),{percentages:true}),'只使用关联题得分与满分齐全的学生。点击班级，在当前观察窗展开该班名单。',chartButtons('lens-knowledge-classes'))+block('班级材料明细',table(['班级','作答份数','完整可比份数','得分率','材料不全'],rows.map(r=>[button(r.no+'班','knowledge-class',{no:r.no},'person-link'),integer(r.count),integer(r.known),percent(r.rate),integer(r.count-r.known)]),{label:'知识点班级差异'}));
  } else {
    body='<div class="lens-question-grid">'+questions.map(q=>'<button class="lens-question" data-cmd="question" data-key="'+esc(state.key)+'" data-index="'+q.index+'" data-classes="'+esc((state.classes||[]).join(','))+'" data-score-tone="'+scoreTone(q.rate).key+'" style="'+scoreStyle(q.rate)+'"><header><b>'+esc(q.label)+'题</b><span>'+q.count+' 份有效得分</span></header><strong>'+percent(q.rate)+'</strong><p>均分 '+number(q.mean)+' / '+number(q.max)+'</p><footer><span>平均失分 '+number(q.loss)+'</span><i aria-hidden="true">↗</i></footer></button>').join('')+'</div><p class="lens-caption">点击一道题，继续看该题的班级与全体作答。题目可能关联多个知识点，不把这些视角的分数再次相加。</p>'+button('从具体学生继续 ↗','drawer-tab',{value:'students'},'outline');
  }
  return head+'<div class="drawer-panel" data-render-key="knowledge-panel-'+tab+'">'+body+'</div>';
}

export function lensEvidence(atlas,state) {
  if(state.type==='subject') {
    const model=subjectLens(atlas,state),headers=['姓名','班级','语种','折合学科分','原分','原考试排名','学科距线','总分距线'],rows=model.matches.map(e=>[atlas.name(e.row.sid),e.row.classNo,e.row.language,e.score,e.raw,e.rank,e.subjectGap,e.totalGap]),timeline=[['考次','人数','缺学科成绩','均分','同类均分'],...model.timeline.map(t=>[t.exam.label,t.own.count,t.own.missing,t.own.mean,t.peers.mean])],scopeRows=[['班级',model.no+'班'],['考次',atlas.exam(state.exam).label],['学科',model.subject],['有效线口径',model.tier==='top'?'特控':'本科'],['名单条件',model.selected],['姓名检索',state.search||'不限']];
    return evidence(model.no+'班 · '+model.subject+'学科研究',atlas.exam(state.exam).label+' · '+model.selected,[{title:'研究范围',headers:['项目','范围'],rows:scopeRows},{title:'完整线索名单',headers,rows},{title:'历次参照',headers:timeline[0],rows:timeline.slice(1)}],{'研究范围':[['项目','范围'],...scopeRows],'学科线索名单':[headers,...rows],'历次学科参照':timeline,'原始成绩':scoreRows(atlas,model.matches.map(e=>e.row))});
  }
  const model=skillLens(atlas,state),headers=['姓名','班级','已填得分','已填题数','关联题数','完整得分率','可计算失分',...model.questions.map(q=>q.label+'题')],rows=model.matches.map(e=>[atlas.name(e.answer.sid),e.answer.classNo,e.total,e.filled,model.questions.length,e.rate,e.loss,...e.values]),questionRows=[['题号','知识点','有效样本','均分','明确满分','得分率','平均失分'],...model.questions.map(q=>[q.label,q.knowledge,q.count,q.mean,q.max,q.rate,q.loss])],scopeRows=[['试卷',model.lens.subject+' · '+atlas.exam(model.lens.exam).label],['知识点',state.knowledge],['班级',state.classes?.length?state.classes.map(no=>no+'班').join('、'):'全部参考班'],['名单条件',model.selected],['姓名检索',state.search||'不限'],['个人得分率口径','关联题得分与满分均齐全才计算']];
  return evidence(model.lens.subject+' · '+state.knowledge+'知识点研究',atlas.exam(model.lens.exam).label,[{title:'研究范围',headers:['项目','范围'],rows:scopeRows},{title:'关联题目',headers:questionRows[0],rows:questionRows.slice(1).map(row=>row.map((v,i)=>i===5?percent(v):v))},{title:'完整关联作答',headers,rows:rows.map(row=>row.map((v,i)=>i===5?percent(v):v))}],{'研究范围':[['项目','范围'],...scopeRows],'关联题目':questionRows,'关联小题作答':[headers,...rows]});
}
