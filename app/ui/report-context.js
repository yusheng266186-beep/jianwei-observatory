import {button,esc} from './html.js?v=runtime-v43';
import {materialPeople} from '../engine/training.js?v=runtime-v43';
import {reportSpec} from './report-studio.js?v=runtime-v43';
import {reportSubjects,reportClasses,reportExams} from '../engine/report-scope.js?v=runtime-v43';
import {reportTypes} from '../engine/reports.js?v=runtime-v43';
export function normalizeReportScope(atlas,spec,change){
 const next={...spec,...change};
 return reportSpec(atlas,{reportKind:next.kind,reportExam:next.exam,reportNo:next.no,reportSubjectClass:next.no,reportPlanClass:next.no,reportSubject:next.subject,reportBand:next.band,reportSid:next.sid,reportRaw:next.includeRaw});
}
export function reportContext(atlas,report,state){
 if(!report.kind||!report.spec)return '';
 const spec=report.spec,choices=(key,options,value)=>'<div class="chips" role="group">'+options.map(([id,title])=>button(esc(title),'report-scope',{key,value:id},String(value)===String(id)?'chip selected':'chip','aria-pressed="'+(String(value)===String(id))+'"')).join('')+'</div>';
 let controls='<p class="report-context-label">报告类型</p>'+choices('kind',reportTypes.filter(([id])=>id==='follow'||reportExams(atlas,id).length).map(([id,title])=>[id,title]),spec.kind);
 controls+=spec.kind==='follow'?'':'<p class="report-context-label">考试</p>'+choices('exam',reportExams(atlas,spec.kind).map(e=>[e.id,(e.label||e.id)+' · '+e.id]),spec.exam);
 if(['class','subject','follow'].includes(spec.kind))controls+='<p class="report-context-label">'+(spec.kind==='class'?'班级':'班级范围')+'</p>'+choices('no',[...(spec.kind!=='class'?[['all','全部参考班']]:[]),...reportClasses(atlas,spec).map(no=>[no,no+'班'])],spec.no);
 if(spec.kind==='class')controls+='<p class="report-context-label">临界生观察范围</p>'+choices('band',[[10,'线下10分'],[20,'线下20分'],[30,'线下30分']],spec.band);
 if(spec.kind==='subject'){const subjects=reportSubjects(atlas,spec.exam);controls+='<p class="report-context-label">学科</p>'+choices('subject',subjects.map(s=>[s,s]),spec.subject);}
 if(spec.kind==='student'){const query=(state.personSearch||'').trim(),classQuery=query.match(/^(\d+)\s*班$/),people=materialPeople(atlas,spec.exam).filter(r=>!query||(classQuery?Number(r.classNo)===Number(classQuery[1]):atlas.name(r.sid).includes(query)));controls+='<p class="report-current-person">当前学生 · <strong>'+esc(atlas.name(spec.sid))+'</strong></p><label class="field"><span>学生（可输入姓名或班级）</span><input data-report-person-search value="'+esc(query)+'" placeholder="例如 4班"></label><div class="report-scope-people">'+choices('sid',people.map(r=>[r.sid,atlas.name(r.sid)+' · '+r.classNo+'班']),spec.sid)+'</div>';}
 return '<details class="report-context"><summary>报告对象与考试 · 可直接切换</summary><div class="report-context-body"><p>仅列出已有材料的考试与对象；切换后更新报告，保留同名章节的勾选、字段和筛选。</p>'+controls+'</div></details>';
}
