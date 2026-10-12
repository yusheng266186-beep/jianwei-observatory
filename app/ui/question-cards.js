import {esc,number,integer,percent} from './html.js?v=refine-v17';
import {valid} from '../engine/metrics.js?v=refine-v17';

export function questionCard(q,{records,threshold,selected=false}) {
  const measured=valid(q.rate),meter=measured&&q.rate>=0&&q.rate<=1;
  const status=q.maxNote||(!valid(q.max)||q.max<=0?'满分待补':!q.count?'暂无有效作答':!meter?'得分异常':q.rate<threshold?'低得分率':q.count<records?'作答未齐':'');
  const value=measured?number(q.rate*100)+'<small>%</small>':'—';
  const label='第'+q.label+'题，'+(q.knowledge||'知识点未标注')+'，得分率'+percent(q.rate)+'，有效作答'+q.count+'份，打开题目观察';
  return '<button type="button" class="question-tile'+(selected?' selected':'')+'" data-motion-key="question-'+q.index+'" data-cmd="question" data-index="'+q.index+'" aria-haspopup="dialog" aria-label="'+esc(label)+'">'
    +'<div class="question-identity"><b>'+esc(q.label)+'<small>题</small></b>'+(status?'<span class="question-status">'+esc(status)+'</span>':'<span class="question-status quiet-status">逐题观察</span>')+'</div>'
    +'<strong>'+value+'</strong><small class="question-mean"><span>得分率</span><span>均分 '+number(q.mean)+' / '+number(q.max)+'</span></small>'
    +'<div class="question-meter" data-known="'+meter+'" aria-hidden="true"><i style="--question-progress:'+(meter?q.rate:0)+'"></i></div>'
    +'<div class="question-context"><span>有效作答 <b>'+integer(q.count)+' / '+integer(records)+'</b></span><span>平均失分 <b>'+number(q.loss)+'</b></span><span>零分 / 达满分 <b>'+integer(q.zero)+' / '+integer(q.full)+'</b></span></div>'
    +'<footer><span><small>知识点</small>'+esc(q.knowledge||'知识点未标注')+'</span><i aria-hidden="true"><svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M5 15 15 5M5 5h10v10"/></svg></i></footer></button>';
}
