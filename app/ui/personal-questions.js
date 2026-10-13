import {button,esc,number} from './html.js?v=surfaces-v27';
import {scoreTone,scoreStyle} from './score-tones.js?v=surfaces-v27';
import {valid} from '../engine/metrics.js?v=surfaces-v27';

export function personalQuestionLink(q,context,label,style='person-link',extra='') {
  return button(label,'answer-question',{key:context.subject+'|'+context.exam,index:q.index,sid:context.sid,classes:context.classNo},style,
    'aria-label="'+esc(context.name+'，'+context.subject+'第'+q.label+'题，得分'+(valid(q.score)?number(q.score):'未填写')+'，查看同题作答')+'" '+extra);
}
export function personalQuestionCard(q,context) {
  const rate=q.max>0&&valid(q.score)?q.score/q.max:null;
  const body='<header><b>'+esc(q.label)+'题</b><span>'+esc(q.knowledge||'知识点未标注')+'</span></header><strong>'+number(q.score)+'<small> / '+number(q.max)+'</small></strong><footer><span>失分 '+number(q.loss)+'</span><i aria-hidden="true">↗</i></footer>';
  return personalQuestionLink(q,context,body,'personal-question-card','data-score-tone="'+scoreTone(rate).key+'" style="'+scoreStyle(rate)+'" data-motion-key="'+esc('answer-'+context.sid+'-'+context.subject+'-'+q.index)+'"');
}
