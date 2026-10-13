import {esc,number,integer,percent} from './html.js?v=paper-v20';
import {valid} from '../engine/metrics.js?v=paper-v20';
import {questionNumbers} from '../engine/paper-structure.js?v=paper-v20';

export function questionCard(q,{records,threshold,selected=false}) {
  const measured=valid(q.rate),meter=measured&&q.rate>=0&&q.rate<=1;
  const status=q.maxNote||(!valid(q.max)||q.max<=0?'满分待补':!q.count?'暂无有效作答':!meter?'得分异常':q.rate<threshold?'低得分率':q.count<records?'作答未齐':'');
  const value=measured?number(q.rate*100)+'<small>%</small>':'—';
  const label='第'+q.label+'题，'+(q.knowledge||'知识点未标注')+'，得分率'+percent(q.rate)+'，有效作答'+q.count+'份，打开题目观察';
  const combined=questionNumbers(q.label).length>1,missing=Math.max(0,records-q.count),rest=valid(q.full)?Math.max(0,q.count-q.zero-q.full):Math.max(0,q.count-q.zero);
  const bands=[[q.zero,'zero'],[rest,'other'],[q.full,'full'],[missing,'missing']];
  const description='零分 '+integer(q.zero)+' 人 · '+(valid(q.full)?'其余 '+integer(rest)+' 人 · 达满分 '+integer(q.full)+' 人':'其余有效作答 '+integer(rest)+' 人 · 满分未知')+' · 未填 '+integer(missing)+' 人';
  const structure='<div class="question-answer-strip" role="img" aria-label="'+esc(description)+'" title="'+esc(description)+'">'+bands.filter(([count])=>valid(count)&&count>0).map(([count,tone])=>'<i class="answer-strip-'+tone+'" style="--answer-share:'+(records?count/records:0)+'"></i>').join('')+'</div>';
  return '<button type="button" class="question-tile'+(selected?' selected':'')+(combined?' is-combined':'')+'" data-motion-key="question-'+q.index+'" data-cmd="question" data-index="'+q.index+'" aria-haspopup="dialog" aria-label="'+esc(label)+'">'
    +'<div class="question-card-top"><div class="question-identity"><b>'+esc(q.label).replace(/题$/,'')+'<small>'+(combined?'合并计分':'题')+'</small></b></div><span class="question-topic">'+esc(q.knowledge||'知识点未标注')+'</span><div class="question-reading"><strong>'+value+'</strong><span>得分率</span></div></div>'
    +'<div class="question-score-line"><span>平均得分</span><b>'+number(q.mean)+'<small> / '+number(q.max)+'</small></b><span>分</span></div>'
    +'<div class="question-meter" data-known="'+meter+'" aria-hidden="true"><i style="--question-progress:'+(meter?q.rate:0)+'"></i></div>'
    +'<div class="question-context"><span>有效作答 <b>'+integer(q.count)+' / '+integer(records)+'</b></span><span>平均失分 <b>'+number(q.loss)+'</b></span><span>零分 / 达满分 <b>'+integer(q.zero)+' / '+integer(q.full)+'</b></span></div>'
    +structure+'<footer><span class="question-mean">均分 '+number(q.mean)+' / '+number(q.max)+'</span>'+(status?'<span class="question-status">'+esc(status)+'</span>':'')+'<span class="question-open">观察本题 <i aria-hidden="true">↗</i></span></footer></button>';
}
