import {esc} from './html.js';
import {exerciseChoice} from './exercise-choice.js';
import {exerciseQuestionTypes,exerciseTypeLabel} from '../engine/exercise-contract.js';
import {exercisePlanRows,exerciseExplicitTypeCount} from '../engine/exercise-question-plan.js';

export function exerciseQuestionPlanHTML(request){
 const count=exerciseExplicitTypeCount(request),options=[{value:'auto',label:'自动搭配'},...exerciseQuestionTypes(request.subject).map(type=>({value:type,label:exerciseTypeLabel(type)}))];
 return '<section class="exercise-question-plan" aria-label="逐题题型安排"><header><div><h4>每一道题，单独安排</h4><p>固定某一题的题型，其余题目仍可自动搭配。</p></div><span data-ai-plan-count>'+count+' / '+request.count+' 题已限定</span></header><div class="exercise-plan-tools"><span>批量设置</span>'+exerciseQuestionTypes(request.subject).map(type=>'<button type="button" class="button quiet" data-ai-action="plan-all" data-ai-value="'+type+'">全部'+esc(exerciseTypeLabel(type))+'</button>').join('')+'<button type="button" class="button quiet" data-ai-action="plan-reset">恢复自动</button></div><ol class="exercise-plan-rows">'+exercisePlanRows(request).map((slot,i)=>'<li data-render-key="question-slot-'+slot.id+'" class="exercise-plan-row'+(slot.explicit?' is-fixed':'')+'"><div class="exercise-plan-number"><span>第</span><b>'+slot.id+'</b><span>题</span></div><div class="exercise-plan-target"><span>训练内容</span><b>'+esc(slot.target||'按所选知识点与训练目标安排')+'</b></div>'+exerciseChoice('question-type-'+i,'第'+slot.id+'题题型',slot.type||'auto',options)+'</li>').join('')+'</ol><p class="report-help">单个选择小题计为 1 题；语法填空、材料分析等可按完整题组计。明确限定的题型会按题号核对。</p></section>';
}

export function exerciseDifficultyHTML(request,profiles){
 const names=['容易','较易','中等','较难','困难'],index=profiles.findIndex(d=>d.id===request.difficulty);
 return '<section class="exercise-difficulty-block"><header class="exercise-difficulty-heading"><h4>这次练到什么程度</h4><span data-ai-difficulty-current>'+esc(names[index]||'较易')+' · '+esc(request.difficulty)+'</span></header><div class="exercise-difficulties" role="group" aria-label="训练难度">'+profiles.map((d,i)=>'<button type="button" class="exercise-difficulty'+(i===index?' selected':'')+'" data-ai-action="difficulty" data-ai-value="'+d.id+'" aria-pressed="'+(i===index)+'"><span class="exercise-difficulty-bars" aria-hidden="true">'+names.map((_,j)=>'<i'+(j<=i?' class="is-on"':'')+'></i>').join('')+'</span><strong>'+names[i]+'</strong><b>'+d.id+'</b><small>'+d.hint+'</small></button>').join('')+'</div><p class="exercise-difficulty-note" role="status">'+esc(profiles[index]?.rule||profiles[1].rule)+'</p></section>';
}
