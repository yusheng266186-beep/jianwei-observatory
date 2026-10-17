import {pickerField} from './plan-controls.js';
import {feedbackMarks,practiceFeedbackCurrent,practiceFeedbackDraftMetrics,practiceFeedbackSummary,practiceKnowledgeHistory,validatePracticeFeedback} from '../engine/exercise-feedback.js';
import {createPracticeFeedbackDrafts} from '../engine/exercise-feedback-drafts.js';
import {todayLocal} from '../engine/training.js';
import {esc,percent} from './html.js';
export function createExerciseFeedbackPanel({root,getRecord,getRecords,save,onSaved=()=>{}}){
 const drafts=createPracticeFeedbackDrafts(todayLocal),previousScores=new WeakMap();const savingRecords=new Set();let shown=null;
 const host=()=>root.querySelector('[data-practice-feedback]');
 const status=(value,error=false)=>{const node=host()?.querySelector('[data-feedback-status]');if(node){node.textContent=value;node.setAttribute('role',error?'alert':'status');}};
 function read(){const record=getRecord(),d=shown?.record===record?shown.d:drafts.get(record),panel=host();if(!panel)return d;
  d.date=panel.querySelector('[data-feedback-date]').value;d.note=panel.querySelector('[data-feedback-note]').value;
  for(const row of d.rows){const input=panel.querySelector('[data-feedback-score="'+row.id+'"]'),blank=panel.querySelector('[data-feedback-blank="'+row.id+'"]'),value=input.value.trim();row.state=blank.checked?'unanswered':value===''?'ungraded':'scored';row.score=blank.checked?0:value===''?null:Number(value);row.marks=[...panel.querySelectorAll('[data-feedback-mark="'+row.id+'"]:checked')].map(i=>i.value);}
  return drafts.changed(d);
 }
 const summary=m=>m.graded+'/'+m.total+'题已批改'+(m.invalid.length?' · '+m.invalid.length+'题得分需修正':'')+(m.graded?' · '+m.score+'/'+m.max+'分':'')+(m.unanswered?' · '+m.unanswered+'题未作答':'');
 const rateText=m=>m.rate==null?'尚无已批改题':percent(m.rate);
 const rowState=(r,invalid)=>invalid?'得分需修正':r.state==='ungraded'?'待批改':r.state==='unanswered'?'未作答':'已批改';
 function refresh(record,d=drafts.get(record)){
  const panel=host();if(!panel||getRecord()!==record)return;const m=practiceFeedbackDraftMetrics(record,d),busy=savingRecords.has(record),stale=drafts.stale(record,d);
  panel.querySelector('[data-feedback-summary]').textContent=summary(m);
  panel.querySelector('[data-feedback-rate]').textContent=rateText(m);
  panel.querySelector('[data-feedback-count]').textContent=m.graded+' / '+m.total;
  panel.querySelector('[data-feedback-remaining]').textContent=(m.total-m.graded)+'题';
  panel.querySelector('[data-feedback-progress]').style.width=(m.total?100*m.graded/m.total:0)+'%';
  panel.querySelector('[data-feedback-dirty]').textContent=d.dirty?'待保存':practiceFeedbackCurrent(record)?'已保存':'尚未保存';
  panel.querySelector('[data-feedback-reload]').hidden=!stale;
  const next=panel.querySelector('[data-feedback-action="next"]');next.disabled=m.graded===m.total&&!m.invalid.length;
  const saveButton=panel.querySelector('[data-feedback-action="save"]');saveButton.disabled=busy;saveButton.textContent=busy?'正在保存…':'保存练后结果';panel.setAttribute('aria-busy',String(busy));
  for(const row of d.rows){const input=panel.querySelector('[data-feedback-score="'+row.id+'"]'),invalid=m.invalid.includes(row.id),error=panel.querySelector('[data-feedback-error="'+row.id+'"]');input.setAttribute('aria-invalid',String(invalid));error.hidden=!invalid;panel.querySelector('[data-feedback-state="'+row.id+'"]').textContent=rowState(row,invalid);}
 }
 function focusScore(record,id){const input=host()?.querySelector('[data-feedback-score="'+id+'"]');if(input){input.focus({preventScroll:true});input.scrollIntoView({block:'nearest',behavior:'auto'});}}
 function nextScore(record,d,after){const m=practiceFeedbackDraftMetrics(record,d),rows=d.rows,at=rows.findIndex(r=>r.id===after),ordered=[...rows.slice(at+1),...rows.slice(0,at+1)],target=ordered.find(r=>m.invalid.includes(r.id)||r.state==='ungraded');if(target)focusScore(record,target.id);else host()?.querySelector('[data-feedback-note]')?.focus({preventScroll:true});}
 function syncInputs(d){const panel=host();if(!panel)return;panel.querySelector('[data-feedback-note]').value=d.note;for(const row of d.rows){const input=panel.querySelector('[data-feedback-score="'+row.id+'"]');input.value=row.score??'';input.disabled=row.state==='unanswered';panel.querySelector('[data-feedback-blank="'+row.id+'"]').checked=row.state==='unanswered';panel.querySelectorAll('[data-feedback-mark="'+row.id+'"]').forEach(i=>i.checked=row.marks.includes(i.value));}}
 function edit(event){const target=event.target;if(!target.closest('[data-practice-feedback]'))return;const record=getRecord();if(!record?.reviewedAt)return;
  if(event.type==='change'&&target.matches('[data-feedback-blank]')){const input=host().querySelector('[data-feedback-score="'+target.dataset.feedbackBlank+'"]');if(target.checked){previousScores.set(input,input.value);input.value='0';}else input.value=previousScores.get(input)??'';input.disabled=target.checked;}
  const d=read();refresh(record,d);status(d.dirty?'本次修改尚未保存。':practiceFeedbackCurrent(record)?'当前结果已保存。':'尚未保存练后结果。');
 }
 root.addEventListener('change',edit);root.addEventListener('input',edit);
 root.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing&&e.target.matches('[data-feedback-score]')){e.preventDefault();const record=getRecord(),d=read(),id=Number(e.target.dataset.feedbackScore),m=practiceFeedbackDraftMetrics(record,d);if(m.invalid.includes(id)){status('请先修正本题得分。',true);return;}nextScore(record,d,id);}});
 root.addEventListener('click',async e=>{
  const b=e.target.closest('[data-feedback-action]');if(!b||b.disabled)return;const record=getRecord();if(!record?.reviewedAt)return;const d=read(),cmd=b.dataset.feedbackAction;
  if(cmd==='next'){nextScore(record,d);return;}
  if(cmd==='reload'){drafts.reset(record);replace(record);status('已载入最新保存的批改。');return;}
  if(cmd==='clear'){const id=Number(b.dataset.question),row=d.rows.find(r=>r.id===id);Object.assign(row,{state:'ungraded',score:null,marks:[]});previousScores.delete(host().querySelector('[data-feedback-score="'+id+'"]'));drafts.changed(d);syncInputs(d);refresh(record,d);focusScore(record,id);status('第'+id+'题已清空，保存后生效。');return;}
  if(cmd!=='save'||savingRecords.has(record))return;
  const submitted=structuredClone(d);savingRecords.add(record);refresh(record,d);status('正在保存练后结果…');let stored=false;
  try{const value=validatePracticeFeedback(record,submitted);await save(record,value,d.expected);stored=true;const remaining=drafts.commit(record,submitted);if(shown?.record===record)shown.d=remaining;await onSaved(record);if(getRecord()!==record)return;syncInputs(remaining);refresh(record,remaining);const history=host()?.querySelector('[data-feedback-history]');if(history){const open=history.querySelector('details')?.open;history.innerHTML=historyHTML(record);if(open&&history.firstElementChild)history.firstElementChild.open=true;}status(remaining.dirty?'本次批改已保存；保存期间的后续修改仍待保存。':'练后结果已保存。');}
  catch(error){if(getRecord()===record){refresh(record);status(stored?'批改已保存，教学跟进同步未完成，请重新打开跟进记录。':error.message,true);const invalid=practiceFeedbackDraftMetrics(record,d).invalid[0];if(invalid!==undefined)focusScore(record,invalid);}}
  finally{savingRecords.delete(record);if(getRecord()===record&&host())refresh(record);}
 });
 function replace(record){const panel=host();if(!panel)return;const wrapper=document.createElement('div');wrapper.innerHTML=html(record);panel.replaceWith(wrapper.firstElementChild);if(host())host().open=true;}
 function historyHTML(record){const history=practiceKnowledgeHistory(getRecords(),{sid:record.sid,subject:record.request.subject});return history.length?'<details class="practice-knowledge-history"><summary>同知识点近期练习</summary><p>仅比较同一学生、同一学科的已保存批改；题型、难度可能不同，不等同于考试成绩提升。</p><dl>'+history.map(g=>'<div><dt>'+esc(g.target)+'</dt><dd>'+g.samples.map(s=>esc(s.date)+' · '+percent(s.rate)+'（'+s.score+'/'+s.max+'分）').join(' → ')+'</dd></div>').join('')+'</dl></details>':'';}
 function html(record){
  if(!record?.sheet||!record.reviewedAt&&!record.practiceFeedback)return '';
  if(!record.reviewedAt)return '<details class="practice-feedback"><summary>练后结果</summary><p>'+(practiceFeedbackCurrent(record)?'请重新确认审题，已批改的练后记录仍保留。':'题目内容已修改。重新审定后，可按新版本记录结果；原记录保存在工作区。')+'</p></details>';
  const d=drafts.get(record),m=practiceFeedbackDraftMetrics(record,d),busy=savingRecords.has(record);shown={record,d};
  return '<details class="practice-feedback" data-practice-feedback aria-busy="'+busy+'"><summary><b>练后结果与复核</b><span data-feedback-summary>'+esc(summary(m))+'</span></summary><p>逐题记录得分和错因，留空表示待批改；得分率仅按已批改题计算。</p><section class="practice-feedback-overview" aria-label="本次练习批改概况"><div><span>练习得分率</span><strong data-feedback-rate>'+rateText(m)+'</strong><small>仅含已批改题</small></div><div><span>批改进度</span><strong data-feedback-count>'+m.graded+' / '+m.total+'</strong><div class="practice-feedback-progress" aria-hidden="true"><i data-feedback-progress style="width:'+(m.total?100*m.graded/m.total:0)+'%"></i></div></div><div><span>待批改</span><strong data-feedback-remaining>'+(m.total-m.graded)+'题</strong><small data-feedback-dirty>'+(d.dirty?'待保存':practiceFeedbackCurrent(record)?'已保存':'尚未保存')+'</small></div></section><div class="practice-feedback-top">'+pickerField('练习日期','practice.date',d.date,'date',{scope:'feedback',empty:'请选择日期'})+'<button type="button" class="button outline" data-feedback-action="next" '+(m.graded===m.total&&!m.invalid.length?'disabled':'')+'>定位下一道待批改题 ↓</button></div><div class="practice-feedback-reload" data-feedback-reload '+(drafts.stale(record,d)?'':'hidden')+'><p>批改记录已有更新。本次未保存修改仍保留，可载入最新结果后继续。</p><button type="button" class="button outline" data-feedback-action="reload">载入最新批改</button></div><div class="practice-feedback-rows">'+record.sheet.questions.map(q=>{const r=d.rows.find(r=>r.id===q.id),invalid=m.invalid.includes(q.id);return '<article><header><div><b>第'+q.id+'题 <small data-feedback-state="'+q.id+'">'+rowState(r,invalid)+'</small></b><span>'+esc(q.target||q.type)+' · 满分'+q.maxScore+'分</span></div><label class="field practice-score"><span>得分</span><input inputmode="decimal" enterkeyhint="next" data-feedback-score="'+q.id+'" value="'+esc(r.score??'')+'" '+(r.state==='unanswered'?'disabled':'')+' aria-invalid="'+invalid+'" aria-describedby="feedback-score-error-'+q.id+'" aria-label="第'+q.id+'题得分，满分'+q.maxScore+'分" placeholder="待批改"></label></header><p class="practice-feedback-error" id="feedback-score-error-'+q.id+'" data-feedback-error="'+q.id+'" '+(invalid?'':'hidden')+'>请输入0至'+q.maxScore+'分之间的有效得分。</p><div class="practice-feedback-controls"><label><input type="checkbox" data-feedback-blank="'+q.id+'" '+(r.state==='unanswered'?'checked':'')+'>未作答 · 0分</label><span class="practice-feedback-mark-label">错因</span>'+feedbackMarks.map(([id,label])=>'<label><input type="checkbox" data-feedback-mark="'+q.id+'" value="'+id+'" '+(r.marks.includes(id)?'checked':'')+'>'+label+'</label>').join('')+'<button type="button" class="button quiet" data-feedback-action="clear" data-question="'+q.id+'">清空本题</button></div></article>';}).join('')+'</div><label class="field"><span>教师复核记录</span><textarea data-feedback-note maxlength="600" rows="2" placeholder="记录错因、订正情况和下一次复核要求">'+esc(d.note)+'</textarea></label><div class="practice-feedback-save"><p role="status" aria-live="polite" data-feedback-status>'+(d.dirty?'本次修改尚未保存。':'')+'</p><button type="button" class="button accent" data-feedback-action="save" '+(busy?'disabled':'')+'>'+(busy?'正在保存…':'保存练后结果')+'</button></div>'+'<div data-feedback-history>'+historyHTML(record)+'</div>'+'</details>';
 }
 return {html};
}
