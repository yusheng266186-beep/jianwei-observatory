import {esc,number,integer,percent} from './html.js?v=optics-v28';
import {valid} from '../engine/metrics.js?v=optics-v28';
import {questionNumbers} from '../engine/paper-structure.js?v=optics-v28';
import {scoreTone,scoreStyle} from './score-tones.js?v=optics-v28';

export function questionCard(q,{records,threshold,selected=false}) {
  const measured=valid(q.rate),normal=measured&&q.rate>=0&&q.rate<=1;
  const status=q.maxNote||(!valid(q.max)||q.max<=0?'满分待补':!q.count?'暂无有效作答':!normal?'得分异常':q.rate<threshold?'低得分率':q.count<records?'作答未齐':'');
  const value=measured?number(q.rate*100)+'<small>%</small>':'—';
  const label='第'+q.label+'题，'+(q.knowledge||'知识点未标注')+'，得分率'+percent(q.rate)+'，有效作答'+q.count+'份，打开题目观察';
  const combined=questionNumbers(q.label).length>1;
  return '<button type="button" class="question-tile question-square'+(selected?' selected':'')+(combined?' is-combined':'')+'" data-known="'+normal+'" data-score-tone="'+scoreTone(q.rate).key+'" style="'+scoreStyle(q.rate)+'" data-motion-key="question-'+q.index+'" data-cmd="question" data-index="'+q.index+'" aria-haspopup="dialog" aria-label="'+esc(label)+'">'
    +'<div class="question-identity"><b><span class="question-number">'+esc(q.label).replace(/题$/,'')+'</span><small>'+(combined?'合并计分':'题')+'</small></b>'+(status?'<span class="question-status">'+esc(status)+'</span>':'<span class="question-status quiet-status">有效计分</span>')+'</div>'
    +'<div class="question-reading"><strong>'+value+'</strong><span>得分率</span></div>'
    +'<span class="question-topic">'+esc(q.knowledge||'知识点未标注')+'</span>'
    +'<p class="question-mean">均分 '+number(q.mean)+' / '+number(q.max)+'</p>'
    +'<div class="question-context"><span>有效作答 <b>'+integer(q.count)+' / '+integer(records)+'</b></span><span>平均失分 <b>'+number(q.loss)+'</b></span><span>零分 / 达满分 <b>'+integer(q.zero)+' / '+integer(q.full)+'</b></span></div>'
    +'<footer><span>作答分布与学生名单</span><span class="question-open">展开 <i aria-hidden="true">↗</i></span></footer></button>';
}
