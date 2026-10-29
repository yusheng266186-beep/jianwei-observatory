// The review board is rendered before generation, not behind a disclosure.
// Keep the wording here so the visible summary and saved-setup preview agree.
import {esc} from './html.js';
import {shortExerciseTarget} from './exercise-question-target.js';
import {exerciseTypeLabel} from '../engine/exercise-contract.js';
import {exerciseVisualLabel} from './exercise-visual-policy.js';

export function exerciseTypeSummary(types){
 return types?.length?types.map(exerciseTypeLabel).join('、'):'按学科自动搭配';
}

export function exerciseCountGuidance(count,types){
 const groups=types?.length||0,n=Number.isInteger(count)?count:0;
 const basis='单个选择小题算1题；语法填空、主观材料题可按题组计，内部小空不另计';
 return (n?n+'题 · ':'')+basis+(groups?' · 已选'+groups+'类答题形式，题数不少于'+groups+'题':'');
}

export function exerciseRequestRows(request,{labels=[],level}={}){
 const types=request?.questionTypes||[],typeText=request.questionPlan?.some(s=>s.type)?request.questionPlan.map(s=>'第'+s.id+'题 '+(s.type?exerciseTypeLabel(s.type):'自动')).join('；'):exerciseTypeSummary(types);
 const count=Number.isInteger(request?.count)?request.count:0,minutes=Number.isInteger(request?.minutes)?request.minutes:0;
 return [
  ['教学范围',request?.curriculum?.trim()||'尚未选择，待补充教材与范围'],
  [request.targetMode==='per-question'?'自动选题参考范围':'知识点',labels.length?labels.join('、'):request.targetMode==='per-question'?'根据整体训练目标安排':'由训练内容补充'],
  ...(request.targetMode==='per-question'?[['逐题安排',request.questionPlan.map(s=>'第'+s.id+'题：'+(s.target?shortExerciseTarget(s.target):'自动选点')+' · '+(s.type?exerciseTypeLabel(s.type):'自动题型')).join('；')]]:[]),
  ['训练重点',request?.focus?.trim()||'尚未填写'],
  ...(request?.requirements?.trim()?[['补充要求',request.requirements.trim()]]:[]),
  ['题型（答题形式）',typeText+(request.questionPlan?.some(s=>s.type)?'':types.length?' · 决定怎么作答，具体任务由训练内容决定':' · 未选择时按学科自动搭配')],
  ['难度与安排',(level||request?.difficulty||'基础巩固')+(count?' · '+count+'题':'')+(minutes?' · '+minutes+'分钟':'')],
  ['配图',exerciseVisualLabel(request?.visuals)]
 ];
}

export function exerciseRequestSummaryHTML(request,options={}){
 return '<dl>'+exerciseRequestRows(request,options).map(([label,value])=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd></div>').join('')+'</dl>';
}

export function exerciseRequestBriefHTML(request,{labels=[],level}={}){
 const types=request?.questionTypes||[],count=Number.isInteger(request?.count)?request.count:0,minutes=Number.isInteger(request?.minutes)?request.minutes:0;
 const chips=[
  [request.targetMode==='per-question'?(request.questionPlan?.filter(s=>s.target).length||0)+'题已指定知识点':labels.length?labels.length+'个知识点':'知识点待补充',request.targetMode!=='per-question'&&!labels.length],
  [request.questionPlan?.some(s=>s.type)?request.questionPlan.filter(s=>s.type).length+'题已限定题型':exerciseTypeSummary(types),false],
  [count?count+'题':'题数待定',!count],
  [minutes?minutes+'分钟':'时长待定',!minutes],
  [level||request?.difficulty||'基础巩固',false],
  [exerciseVisualLabel(request?.visuals),false]
 ];
 return '<section class="exercise-request-brief" aria-label="本次已选要求">'+
  '<header class="exercise-request-brief-head"><div><span class="eyebrow">本次已选要求</span><h3>生成前直接核对</h3></div><p>核对知识点、逐题题型和难度，再开始生成。</p></header>'+
  '<div class="exercise-request-chips">'+chips.map(([text,warn])=>'<span class="exercise-request-chip'+(warn?' is-warn':'')+'">'+esc(text)+'</span>').join('')+'</div>'+
  '<div class="exercise-selection-summary" data-ai-selection-summary></div>'+
  '<p class="exercise-request-note">范围按所选教学进度与高考要求；材料、数据与新情境可原创拓展，不超纲。'+esc(exerciseCountGuidance(count,types))+'。</p>'+
 '</section>';
}
