import {button,esc,integer,number,percent} from './html.js?v=cohesion-v22';
import {chartButtons} from './plots.js?v=cohesion-v22';
import {scoreTone,scoreTones,scoreLegend} from './score-tones.js?v=cohesion-v22';
import {valid} from '../engine/metrics.js?v=cohesion-v22';
import {paperStructure,paperCountLabel,paperMapLayout,questionNumbers} from '../engine/paper-structure.js?v=cohesion-v22';

export function paperProfile(lens,{threshold,selected,metrics,examLabel=lens.exam,scopeLabel='全部参考班'}) {
  const questions=lens.questions,structure=paperStructure(questions),layout=paperMapLayout(questions.length,760);
  const points=questions.map((q,i)=>{
    const normal=valid(q.rate)&&q.rate>=0&&q.rate<=1,merged=questionNumbers(q.label).length>1;
    const title='第'+q.label+'题 · '+(q.knowledge||'知识点未标注')+'\n'+(merged?'原表合并计分；没有单独各题得分。\n':'')+(valid(q.rate)?percent(q.rate):'得分率未知')+' · 均分 '+number(q.mean)+' / 满分 '+number(q.max)+' · 有效作答 '+integer(q.count)+' / '+integer(lens.answers.length);
    const label=String(q.label).replace(/题$/,'').trim(),fontSize=label.length>6?11:14,p=layout.position(i),shade=scoreTone(q.rate),tone=shade.ink;
    return '<g class="profile-question'+(selected?.index===q.index?' is-current':'')+'" data-render-key="profile-question-'+q.index+'" data-plot-action="true" data-cmd="question" data-index="'+q.index+'" data-rate="'+(normal?q.rate:'')+'" data-score-tone="'+shade.key+'" data-merged="'+merged+'" transform="translate('+p.x+','+p.y+')" role="button" tabindex="0" aria-label="'+esc(title.replaceAll('\n','，')+'，按全卷题序打开观察窗')+'"><title>'+esc(title)+'</title>'
      +'<rect class="profile-tile" x=".5" y=".5" width="'+(layout.cellWidth-1)+'" height="106" rx="10" fill="url(#'+'score-square-'+shade.key+')" stroke="'+shade.edge+'"/>'
      +'<path class="profile-edge" d="M10,2 H'+(layout.cellWidth-10)+'" stroke="#ffffff" stroke-opacity=".9" stroke-linecap="round" pointer-events="none"/>'
      +'<text class="profile-number" x="11" y="22" fill="'+shade.ink+'" font-size="'+fontSize+'">'+esc(label)+'</text>'
      +'<text class="profile-rate" x="11" y="52" fill="'+tone+'" font-size="22">'+(normal?number(q.rate*100):'—')+(normal?'<tspan font-size="10" dx="2">%</tspan>':'')+'</text>'
      +'<text class="profile-score" x="11" y="74" fill="'+shade.muted+'" font-size="9">'+(merged?'合并 ':'均 ')+number(q.mean)+' / '+number(q.max)+'</text>'
      +(normal?'<text class="profile-sample" x="11" y="94" fill="'+shade.muted+'" font-size="9">有效 '+integer(q.count)+' 份</text>':'<text class="profile-unknown" x="11" y="94" fill="'+shade.muted+'" font-size="9">'+(!valid(q.max)||q.max<=0?'满分待补':q.count?'比例异常':'无有效作答')+'</text>')+'</g>';
  }).join('');
  const low=questions.filter(q=>valid(q.rate)&&q.rate<threshold).length,missing=questions.filter(q=>q.count<lens.answers.length).length,maxMissing=questions.filter(q=>!valid(q.max)||q.max<=0).length;
  const clues=[['low','低得分率',low,'低于 '+percent(threshold)],['missing','有空白的题目',missing,'已有记录中的未填得分'],['max','满分资料待补',maxMissing,'原始分数继续保留']];
  const merged=structure.combined.length?'<div class="paper-combined-note"><span>合并计分</span><p>'+structure.combined.map(e=>'第 '+esc(e.question.label).replace(/题$/,'')+' 题').join('、')+'在原表中合并为一个得分项，保留合计得分。</p></div>':'';
  const metadata='<desc>'+esc(lens.subject+' · '+examLabel+' · '+scopeLabel+' · '+paperCountLabel(questions)+'。全卷题序自动换行；未知或异常比例不绘制。低得分率口径低于 '+percent(threshold))+'</desc>';
  const fills='<defs>'+[...scoreTones,scoreTone(null)].map(tone=>'<linearGradient id="score-square-'+tone.key+'" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+tone.fill+'" stop-opacity="1"/><stop offset="1" stop-color="'+tone.fill+'" stop-opacity=".86"/></linearGradient>').join('')+'</defs>';
  const graph=questions.length?'<svg id="paper-score-profile" class="paper-profile-plot paper-score-atlas" viewBox="0 0 '+layout.width+' '+layout.height+'" role="group" aria-label="全卷题序和得分率方块，全部得分项自动换行显示"><rect class="profile-background" width="'+layout.width+'" height="'+layout.height+'" fill="#f3f8fc"/>'+metadata+fills+points+'</svg>':'<div class="paper-profile-empty">这张卷尚无题号资料，可补充对应的小题材料。</div>';
  const last=questions.at(-1);
  return '<section class="paper-overview" aria-label="全卷概况"><div class="paper-profile"><header><div><span class="profile-kicker">看清题序，再研究得分</span><h2>全卷题序</h2><p>'+esc(scopeLabel)+' · 每格显示得分率与均分 / 满分</p></div><div class="paper-profile-actions">'+chartButtons('paper-score-profile')+'<div class="paper-number-count"><strong>'+integer(structure.numberCount??structure.scoreCount)+'</strong><span>'+(structure.numberCount!==null?'个题号':'个得分项')+'<small>'+structure.scoreCount+' 个得分项</small></span></div></div></header>'+graph+merged+scoreLegend()+'<footer><span><i aria-hidden="true"></i>低得分率口径：低于 '+percent(threshold)+'</span><span>— 表示满分未知、无作答或比例异常</span>'+(last?button('末题 · '+esc(last.label).replace(/题$/,'')+' ↗','question',{index:last.index},'profile-last'):'')+'</footer></div><aside class="paper-study-start">'+metrics+'<div class="paper-clues"><h3>从这里开始研究</h3>'+clues.map(([value,label,count,detail])=>button('<span><b>'+label+'</b><small>'+detail+'</small></span><strong>'+integer(count)+'<small>项</small></strong><i aria-hidden="true">↗</i>','paper-focus',{value},'paper-clue','aria-label="'+label+'，'+count+'个得分项，查看对应题目"')).join('')+'</div></aside></section>';
}
