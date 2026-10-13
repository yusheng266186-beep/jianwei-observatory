import {goalCards} from '../ui/evidence-visuals.js?v=controls-v25';
import {overview} from './overview.js?v=controls-v25';
import {head,button,chips,examChips,badge,block,examRail,ribbon,table,number,integer,percent,delta,esc,personButton,search,footnote} from '../ui/html.js?v=controls-v25';
import {mini,bars,trajectory,spread,chartButtons} from '../ui/plots.js?v=controls-v25';
import {difference,average} from '../engine/metrics.js?v=controls-v25';
import {scoreRows,effectiveRows,subjectRows,evidence} from '../io/exports.js?v=controls-v25';
const tools=()=>button('摘录这页','capture',{},'outline')+button('导出','export',{},'accent');
export function render(atlas,state) {
  const exam=state.exam||atlas.latest,groups=atlas.groups(exam),rows=atlas.rows(exam),s=atlas.summary(rows);
  let body='',sections=[],sheets={};
  if(state.mode==='overview'||!state.mode) {
    body=overview(atlas,state);
    sheets={'班级有效人':effectiveRows(atlas,exam),'学科有效与双上线':subjectRows(atlas,exam),'全部成绩':scoreRows(atlas,rows)};
    sections=[{title:'班级有效人',headers:sheets['班级有效人'][0],rows:sheets['班级有效人'].slice(1)}];
  } else if(state.mode==='map') {
    const metric=state.metric||'underRate',labels={mean:'总分均分',topRate:'特控率',underRate:'本科率'};
    body='<div class="board-matrix">'+groups.map(group=>'<section class="group-row"><div class="group-caption"><span class="overline">'+esc(group.short)+'</span><strong>'+integer(group.summary.count)+'<small> 人</small></strong><p>特控 '+integer(group.summary.top)+' · 本科 '+integer(group.summary.under)+'</p></div><div class="class-tiles">'+group.classes.map(no=>{
      const snapshot=atlas.snapshot(no,exam),value=snapshot.summary[metric],history=atlas.timeline(no),series=history.map(t=>t.summary[metric]);
      return '<button class="class-tile" data-cmd="class" data-no="'+no+'"><div class="tile-top"><span>'+no+'<small> 班</small></span><i>↗</i></div><div class="tile-value">'+(metric.includes('Rate')?percent(value):number(value))+'</div>'+mini(series)+'<footer>'+esc(snapshot.profile.type)+'<span>'+integer(snapshot.summary.count)+'人</span></footer></button>';
    }).join('')+'</div></section>').join('')+'</div>';
    body=chips('metric',Object.entries(labels),metric)+body;
    body+='<div class="class-split">'+groups.map(group=>block(group.title+' · 总分分布',spread('grade-spread-'+group.key,group.rows.map(r=>r.total),group.rows[0]?[{label:'特控',value:atlas.line(group.rows[0],'top')},{label:'本科',value:atlas.line(group.rows[0],'under')}]:[],{exam,track:group.key})+table(['均分','中位数','标准差','中间50%'],[[number(group.summary.mean),number(group.summary.median),number(group.summary.sd),number(group.summary.lower)+'–'+number(group.summary.upper)]]),'含对应科类的补习班。',chartButtons('grade-spread-'+group.key))).join('')+'</div>';
    sections=[{title:labels[metric]+' · 班级位置',headers:['班级','类别','届别','均分','特控人数','本科人数','本科率'],rows:atlas.classes.map(no=>{const c=atlas.snapshot(no,exam);return [no+'班',c.profile.track==='physics'?'物理':'历史',c.profile.cohort==='repeat'?'补习':'应届',number(c.summary.mean),integer(c.summary.top),integer(c.summary.under),percent(c.summary.underRate)];})}];
    sheets={'班级位置':sections[0].rows.length?[sections[0].headers,...sections[0].rows]:[]};
  } else if(state.mode==='targets') {
    const previous=atlas.exams.some(e=>e.id===state.comparison)&&state.comparison!==exam?state.comparison:atlas.exams[atlas.exams.findIndex(e=>e.id===exam)-1]?.id||'';
    const target=(actual,value)=>value>0?'<div class="target-track"><i style="width:'+Math.max(0,Math.min(100,(actual??0)/value*100))+'%"></i><span>'+integer(actual)+' / '+integer(value)+'</span></div>':'<span class="muted">未设任务</span>';
    body='<div class="comparison-bar"><span>增量对照</span>'+examChips(atlas,'comparison',atlas.exams.filter(e=>e.id!==exam),previous)+'</div>';
    body+=groups.map(group=>block(group.title,goalCards(atlas,group.classes,exam)+table(['班级','班主任','人数','均分 / 增量','特控 / 增量','外语有效','特控任务','本科 / 增量','外语有效','本科任务','线下10 / 20分'],group.classes.map(no=>{
      const snapshot=atlas.snapshot(no,exam),p=snapshot.profile,d=snapshot.summary,old=atlas.summary(atlas.classAt(no,previous));
      const foreignEffective=tier=>integer(atlas.summary(snapshot.rows,'外语')[tier]);
      return [button(no+'班','class',{no},'person-link'),esc(p.lead||'—'),integer(d.count),number(d.mean)+'<small>'+delta(difference(d.mean,old.mean))+'</small>',integer(d.top)+'<small>'+delta(difference(d.top,old.top))+'</small>',foreignEffective('top'),target(d.top,p.targets?.top),integer(d.under)+'<small>'+delta(difference(d.under,old.under))+'</small>',foreignEffective('under'),target(d.under,p.targets?.under),'<small>特控 '+d.topNear10+' / '+d.topNear20+'</small><small>本科 '+d.underNear10+' / '+d.underNear20+'</small>'];
    })), '17班计入物理类，18班计入历史类。')).join('');
    sheets={'班级有效人':effectiveRows(atlas,exam,previous),'学科有效与双上线':subjectRows(atlas,exam)};
    sections=[{title:'班级有效人',headers:sheets['班级有效人'][0],rows:sheets['班级有效人'].slice(1)}];
  } else if(state.mode==='subjects') {
    const subjects=atlas.comparisonSubjects(rows),subject=subjects.includes(state.subject)?state.subject:subjects[0];
    body=chips('subject',subjects,subject);
    body+=groups.map(group=>{
      const measured=group.classes.map(no=>({no,summary:atlas.summary(atlas.classAt(no,exam),subject)})).filter(c=>c.summary.count);
      return block(group.title+' · '+(subject||''),bars('subject-'+group.key.replace('|','-'),measured.map(c=>({label:c.no+'班',value:c.summary.mean})))+table(['班级','任课教师','人数','均分 / 原分','特控有效 / 双上线','本科有效 / 双上线','本科有效率'],measured.map(c=>[button(c.no+'班','class',{no:c.no},'person-link'),esc(atlas.teacher(c.no,subject)||'—'),integer(c.summary.count),number(c.summary.mean)+' / '+number(c.summary.raw),integer(c.summary.top)+' / '+integer(c.summary.topDouble),integer(c.summary.under)+' / '+integer(c.summary.underDouble),percent(c.summary.underRate)])),'英语与日语按表内折合成绩统一比较为外语；地理与生物保留各自学科记录。');
    }).join('');
    sheets={'学科有效与双上线':subjectRows(atlas,exam)};sections=[{title:'各班学科有效',headers:sheets['学科有效与双上线'][0],rows:sheets['学科有效与双上线'].slice(1)}];
  } else if(state.mode==='history') {
    const metric=state.historyMetric||'mean',labels={mean:'均分',topRate:'特控率',underRate:'本科率',top:'特控人数',under:'本科人数'};
    const series=groups.map(group=>({name:group.title,values:atlas.exams.map(e=>{const value=atlas.groups(e.id).find(g=>g.key===group.key).summary[metric];return value===null?null:metric.includes('Rate')?value*100:value;})}));
    body=chips('historyMetric',Object.entries(labels),metric)+block('两类学生的纵向变化',trajectory('grade-story',atlas.exams.map(e=>e.id),series,{suffix:metric.includes('Rate')?'%':''}), '17班并入物理类，18班并入历史类。',chartButtons('grade-story'));
    const historyRows=atlas.exams.flatMap(e=>atlas.groups(e.id).map(group=>[e.label,group.title,group.summary.count,group.summary.mean,group.summary.top,group.summary.under,group.summary.underRate]));
    body+=table(['考试','教学组','人数','均分','特控人数','本科人数','本科率'],historyRows.map(row=>row.map((v,i)=>i===6?percent(v):i===3?number(v):esc(v))));
    sheets={'年级历次变化':[['考试','教学组','人数','均分','特控人数','本科人数','本科率'],...historyRows]};sections=[{title:'年级历次变化',headers:sheets['年级历次变化'][0],rows:historyRows.map(row=>row.map((v,i)=>i===6?percent(v):i===3?number(v):v))}];
  } else {
    const matched=rows.filter(row=>atlas.name(row.sid).includes(state.search||'')),page=Math.min(state.page||1,Math.max(1,Math.ceil(matched.length/50))),shown=matched.slice((page-1)*50,page*50);
    body='<div class="roster-bar">'+search('search',state.search)+'<span>'+matched.length+' 人</span></div>'+table(['姓名','班级','语种','总分','原分','特控分差','本科分差'],shown.map(row=>[personButton(atlas,row.sid),button(row.classNo+'班','class',{no:row.classNo},'person-link'),esc(row.language),number(row.total),number(row.rawTotal),delta(atlas.gap(row,'top')),delta(atlas.gap(row,'under'))]));
    body+='<div class="pagination">'+button('←','page',{step:-1},'outline',page<=1?'disabled':'')+'<span>'+page+' / '+Math.max(1,Math.ceil(matched.length/50))+'</span>'+button('→','page',{step:1},'outline',page*50>=matched.length?'disabled':'')+'</div>';
    sheets={'年级成绩':scoreRows(atlas,matched)};sections=[{title:'年级成绩',headers:sheets['年级成绩'][0],rows:sheets['年级成绩'].slice(1)}];
  }
  const isOverview=!state.mode||state.mode==='overview',titles={map:'班级地图',targets:'班级有效与任务',subjects:'学科横向比较',history:'年级阶段对比',roster:'年级学生清册'};
  const toolbar='<div class="scene-toolbar board-toolbar"><div class="scene-tabs">'+chips('mode',[['overview','研究总览'],['map','班级地图'],['targets','有效账'],['subjects','学科横向'],['history','历次变化'],['roster','学生清册']],state.mode||'overview')+'</div>'+examRail(atlas,exam)+'</div>';
  const html=head('01 / 年级总览',isOverview?'年级总览':titles[state.mode]||'年级研究',[atlas.data.grade,atlas.exam(exam).label].filter(Boolean).join(' · '),tools())+toolbar+(isOverview?'':ribbon([['成绩记录',integer(rows.length),'有总分 '+s.count+' 人 · 缺 '+s.missing+' 人'],['特控人数',integer(s.top),'按各生所属科类判断'],['本科人数',integer(s.under),'按各生所属科类判断'],['本科临界',integer(s.underNear20),'线下20分 · 含10分']]))+body+footnote('空缺成绩不补0；任务留空或为0时不计算完成率。10分临界带包含在20分临界带内。');
  return {html,report:evidence('年级研究 · '+atlas.exam(exam).label,atlas.data.school||'荣县第一中学高三成绩分析',sections,sheets)};
}
