import {esc,number,integer,percent} from './html.js?v=paper-v18';
import {valid} from '../engine/metrics.js?v=paper-v18';

export function questionCard(q,{records,threshold,selected=false}) {
  const measured=valid(q.rate),meter=measured&&q.rate>=0&&q.rate<=1;
  const status=q.maxNote||(!valid(q.max)||q.max<=0?'满分待补':!q.count?'暂无有效作答':!meter?'得分异常':q.rate<threshold?'低得分率':q.count<records?'作答未齐':'');
  const value=measured?number(q.rate*100)+'<small>%</small>':'—';
  const circumference=2*Math.PI*31;
  const dial='<div class="question-meter question-dial" data-known="'+meter+'" aria-hidden="true"><svg viewBox="0 0 76 76" fill="none"><circle class="dial-track" cx="38" cy="38" r="31"/><circle class="dial-progress" cx="38" cy="38" r="31" stroke-dasharray="'+circumference+'" stroke-dashoffset="'+(circumference*(1-(meter?q.rate:0)))+'"/></svg><div data-length="'+(measured?number(q.rate*100).length:1)+'"><strong>'+value+'</strong><span>得分率</span></div></div>';
  const label='第'+q.label+'题，'+(q.knowledge||'知识点未标注')+'，得分率'+percent(q.rate)+'，有效作答'+q.count+'份，打开题目观察';
  return '<button type="button" class="question-tile'+(selected?' selected':'')+'" data-motion-key="question-'+q.index+'" data-cmd="question" data-index="'+q.index+'" aria-haspopup="dialog" aria-label="'+esc(label)+'">'
    +'<div class="question-identity"><b>'+esc(q.label)+'<small>题</small></b>'+(status?'<span class="question-status">'+esc(status)+'</span>':'<span class="question-status quiet-status">逐题观察</span>')+'</div>'
    +'<h2 class="question-topic">'+esc(q.knowledge||'知识点未标注')+'</h2>'
    +'<div class="question-evidence">'+dial+'<div class="question-context"><span>有效作答 <b>'+integer(q.count)+' / '+integer(records)+'</b></span><span>平均失分 <b>'+number(q.loss)+'</b></span><span>零分 / 达满分 <b>'+integer(q.zero)+' / '+integer(q.full)+'</b></span></div></div>'
    +'<footer><span class="question-mean">均分 '+number(q.mean)+' / '+number(q.max)+'</span><span class="question-open">观察本题<i aria-hidden="true"><svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M5 15 15 5M5 5h10v10"/></svg></i></span></footer></button>';
}
